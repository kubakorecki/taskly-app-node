---
name: backend-unit-tests
description: Backend unit-test conventions and the mandatory edge-case and security checklist. Use when writing or updating tests for `backend/src`.
---

# Backend unit tests

## Where tests live

- One file per source module, flat in `backend/tests/`, named after the source basename: `src/features/todos/router.ts` → `tests/router.test.ts`. On a basename clash, prefix the folder: `tests/<folder>-<basename>.test.ts`.
- Import source with the `.ts` extension: `import { createApp } from '../src/factory.ts'`.
- Shared fixtures live in `tests/fixture.ts`: `record` is a Prisma row (`Date` fields), `todo` is the same Task as API JSON (ISO strings, `due_date` as `YYYY-MM-DD`). Vary them by spread (`{ ...record, completed: true }`). Add a new export there only when two test files need it.

## Seams

Pick the seam by what the module touches:

- **Pure modules** (validators, mappers, config): call them directly. Use `safeParse(input).success` for rejections and `parse` for accepted output.
- **Prisma** (repository, health, `initialize`): construct the real client and stub its IO. No PostgreSQL runs.

  ```ts
  afterEach(() => vi.restoreAllMocks());

  function setup() {
    const database = createDatabase('postgresql://test:test@localhost:5432/test');
    return { database, repository: new TodoRepository(database) };
  }

  const findMany = vi.spyOn(database.todo, 'findMany').mockResolvedValue([record]);
  ```

  Spy on delegate methods (`database.todo.create`) and client methods (`database.$executeRaw`, `$connect`) the same way. Assert what Prisma received with `toHaveBeenCalledWith`, or read `spy.mock.calls[0][0].data` when only some fields matter.
- **A router alone**: mount it on a bare app with a `TodoStore` stub, and drive it with Supertest.

  ```ts
  function setup() {
    const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
    const app = express();
    app.use(express.json());
    app.use('/api/todos', createTodosRouter(repository));
    return { app, repository };
  }
  ```

  When a flow spans several requests (create, then get), back the stub with an in-memory array of Tasks rather than chaining `mockResolvedValueOnce`.
- **The whole app** (`createApp`: JSON parsing, 404, the error handler, health, docs): `createApp(database)` with the Prisma spies above, through Supertest.
- **Logging**: `vi.spyOn(console, 'error').mockImplementation(() => {})`. Keep the output clean and assert the call.
- **Environment** (`config.ts`): `vi.stubEnv(name, value)` with `afterEach(() => vi.unstubAllEnvs())`. `config.ts` loads the repo `.env` on import, so stub every variable the test depends on, and stub `''` for any variable that must be absent.
- **Import-time side effects** (`main.ts`): `vi.mock('../src/core/lifespan.ts', () => ({ start: vi.fn() }))`, set the mock's behaviour, then `await import('../src/main.ts')` inside the test. Use `vi.resetModules()` in `afterEach` to re-import it, and reset `process.exitCode` after asserting on it.

## Style

Terse, like the existing files:

- Top-level `it` blocks. Use one `describe` only when it names the unit.
- Titles and `describe` labels are present-tense behaviour in Task language: `'creates tasks with trimmed input and defaults'`, never "todo" (an older label like `'todo validation'` is not a model). Identifiers in code stay `Todo`.
- One `setup()` per file returning what the tests need.
- Tables via `it.each([...])('rejects invalid id %s', ...)`, with `%j` for objects.
- Several related `expect`s per test are fine. Assert exact values (`toEqual`, `toHaveBeenCalledWith`), and assert that the store or Prisma was not called on rejected input.
- Long single lines are fine; the backend has no formatter. Comment only a non-obvious why.

## Edge-case and security checklist

Mandatory for every module under test. For each item, either a test covers it, or you record why it doesn't apply to this file (the reason goes in the report).

1. **Boundary lengths and blank input**: exactly the maximum accepted, maximum + 1 rejected (title 120/121, description 2000/2001), plus `''` and whitespace-only.
2. **Unknown and extra fields, `__proto__`**: strict schemas reject extra keys (`{ title: 'Task', id: 1 }`). Send prototype payloads as a raw JSON string, because an object literal's `__proto__` sets the prototype instead of a key:

   ```ts
   await request(app).post('/api/todos').set('Content-Type', 'application/json').send('{"title":"Task","__proto__":{"admin":true}}');
   ```

   Also try `constructor` and `prototype`. Expect 422 and an uncalled store.
3. **IDs**: `'0'`, `'-1'`, `'1.5'`, `'abc'` and `'9007199254740992'` (beyond `MAX_SAFE_INTEGER`) give 422, and the store is never called.
4. **Error responses don't leak**: make Prisma reject with a revealing message (`'connect ECONNREFUSED 10.0.0.5:5432'`). Expect the 500 body to be exactly `{ detail: 'Internal Server Error' }`, and `response.text` to contain neither the message nor `at `. Cover malformed JSON (422 `Invalid JSON.`) and oversized bodies (413).
5. **HTML or script in user text**: a title like `<script>alert(1)</script>` is stored and returned verbatim. Escaping is the frontend's job, so assert the text is unchanged, not sanitized.
6. **Failure paths** (the backend's counterpart to UI error, loading and disabled states): cover a missing Task (404 `Task not found.`, `null`, `false`), a rejected Prisma call propagating, and an empty patch.
