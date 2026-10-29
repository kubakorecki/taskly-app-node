---
name: frontend-unit-tests
description: Frontend unit-test conventions and the mandatory edge-case and security checklist. Use when writing or updating tests for `frontend/src`.
---

# Frontend unit tests

## Where tests live

- Co-located next to the source, same basename: `components/TodoItem.tsx` → `components/TodoItem.test.tsx`. Use `.test.ts` when the file has no JSX.
- The shared Task fixture is `todoFixture` from `src/test/todoFixture.ts`. Vary it by spread (`{ ...todoFixture, completed: true }`). Add a new export there only when two test files need it.
- `src/test/setup.ts` already loads jest-dom matchers and runs `cleanup` after each test.

## Seams

Pick the seam by what the module touches:

- **Design system**: every component test replaces it with the Vitest mocks. They are `vi.fn` components that render native elements, so you can assert props:

  ```tsx
  vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

  expect(vi.mocked(Alert).mock.calls[0][0]).toEqual(expect.objectContaining({ variant: 'success' }))
  ```

  Add `beforeEach(() => vi.clearAllMocks())` when asserting on calls.
- **Components**: `render`, then query the way a user finds things: `getByRole('button', { name: 'Save task' })`, `getByLabelText(/Task title/)`. Create `const user = userEvent.setup()` before `render`, `await` every `user.*` call, and use `rerender` for prop changes. Pass callbacks as `vi.fn()` and assert both the called one and the uncalled ones.
- **Containers** (`TodosPage`): `vi.mock` each hook and child component, then type the return values:

  ```tsx
  vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
  vi.mocked(useTodosQuery).mockReturnValue({ data: [], isPending: true } as unknown as ReturnType<typeof useTodosQuery>)
  ```

- **React Query hooks**: use a fresh client per test, with retries off, through a wrapper. Mock `todosApi`, seed the cache with `setQueryData`, and assert on `getQueryData`:

  ```tsx
  vi.mock('../api/todos', () => ({ todosApi: { create: vi.fn() } }))

  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return { client, wrapper }
  }

  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  result.current.mutate(todoFixture)
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  ```

  For a component that needs the full providers, render it inside `<AppProviders client={client}>`.
- **API layer** (`api/todos.ts`): `vi.mock('../../../lib/http', () => ({ request: vi.fn() }))`, then assert the exact path and `init`.
- **fetch** (`lib/http.ts`): stub the global and answer with real `Response`s:

  ```ts
  afterEach(() => vi.unstubAllGlobals())

  const fetch = vi.fn().mockResolvedValue(Response.json({ detail: 'Task not found.' }, { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  ```

  Reject with a `TypeError` for a network failure. For an abort, call `controller.abort()`, pass `controller.signal`, and make `fetch` reject with `new DOMException('Aborted', 'AbortError')`: the original error must be rethrown.
- **Timers** (`useNotice`): `vi.useFakeTimers()` with `afterEach(() => vi.useRealTimers())`. Wrap `vi.advanceTimersByTime` in `act`, and step to just before the deadline and onto it. With `userEvent`, use `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`.

## Style

Terse, like the existing files:

- Top-level `it` blocks. Use one `describe('<Unit>')` only when it names the unit.
- Titles and `describe` labels are present-tense behaviour in Task language: `'shows an active task and forwards edit requests'`, never "todo". Identifiers in code stay `Todo`.
- Assert what the user sees (`toBeVisible`, `toHaveTextContent`, `toBeDisabled`) over implementation details.
- Comment only a non-obvious why.

## Edge-case and security checklist

Mandatory for every module under test. For each item, either a test covers it, or you record why it doesn't apply to this file (the reason goes in the report).

1. **Boundary lengths and blank input**: empty and whitespace-only titles show `Enter a task title.` and never submit. Where a module enforces length limits (title 120, description 2000), test maximum and maximum + 1. Where it leaves them to the server, the server's 422 maps to a fixed message (item 4).
2. **Unknown and extra fields, `__proto__`**: request bodies carry only writable fields. Pass a full `Todo`, or one with extra keys, and assert the exact `body` sent. A server response with an unexpected `__proto__` key doesn't change what renders.
3. **IDs**: IDs come from the server, which rejects invalid, negative and too-large ones (see `backend-unit-tests`). Here, assert that the ID passed in reaches the path unchanged (`/todos/7`, and `Number.MAX_SAFE_INTEGER`), and that the server's rejection surfaces as an error message.
4. **Error responses don't leak**: a server `detail` string is shown as is. A non-string `detail`, an unparseable body, a 422 and a network failure each map to their fixed user-facing message. No stack, status text or raw body reaches the screen.
5. **HTML or script in user text**: render a Task titled `<img src=x onerror=alert(1)>`. Assert `getByText` finds the literal string, and that `container.querySelector('img')` is `null`.
6. **Error, loading and disabled UI states**: cover the pending, error (with retry) and empty states. While `busy`, the controls are disabled, and clicking them calls nothing.

## Formatting

After writing or editing test files, format exactly those files from the repo root:

```sh
frontend/node_modules/.bin/prettier --write frontend/src/features/todos/components/TodoItem.test.tsx
```

The code blocks above are condensed. Prettier rewraps them to the repo's style, so `format:check` stays green.
