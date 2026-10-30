import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { SuccessNotice } from '../../components/SuccessNotice'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoFilters } from './components/TodoFilters'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: vi.fn(() => <h1>Tasks</h1>),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: vi.fn(() => null) }))
vi.mock('./components/TodoList', () => ({
  TodoList: vi.fn(() => <p>Task list</p>),
}))
vi.mock('./components/TodoEditor', () => ({ TodoEditor: vi.fn(() => null) }))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(() => null),
}))
vi.mock('../../components/SuccessNotice', () => ({
  SuccessNotice: vi.fn(() => null),
}))
beforeEach(() => vi.clearAllMocks())

function setup({
  todos = [todoFixture] as Todo[],
  loaded = true,
  isPending = false,
  isFetching = false,
  isError = false,
  queryError = null as Error | null,
  mutationError = null as Error | null,
  mutateAsync = vi.fn(),
  busy = false,
  message = '',
} = {}) {
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const notify = vi.fn()
  const data = loaded ? todos : undefined
  const filters = {
    filter: 'active' as const,
    search: 'demo',
    sort: 'due' as const,
    visible: data ?? [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  }
  vi.mocked(useTodosQuery).mockReturnValue({
    data,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset,
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message, notify })
  vi.mocked(useTodoFilters).mockReturnValue(filters)
  return { refetch, reset, notify, filters, mutateAsync }
}

const listProps = () => vi.mocked(TodoList).mock.lastCall![0]
const editorProps = () => vi.mocked(TodoEditor).mock.lastCall![0]
const deleteProps = () => vi.mocked(DeleteTodoDialog).mock.lastCall![0]

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('wires the loaded tasks, filters and notice into the page', () => {
  const { filters } = setup({ message: 'Task deleted.' })
  render(<TodosPage />)
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(vi.mocked(useTodoFilters)).toHaveBeenCalledWith([todoFixture])
  expect(vi.mocked(TodosHeader).mock.lastCall![0].disabled).toBe(false)
  expect(vi.mocked(TodoFilters).mock.lastCall![0]).toEqual({
    filter: 'active',
    search: 'demo',
    sort: 'due',
    onFilterChange: filters.setFilter,
    onSearchChange: filters.setSearch,
    onSortChange: filters.setSort,
  })
  expect(listProps()).toEqual(
    expect.objectContaining({
      todos: [todoFixture],
      hasTodos: true,
      loading: false,
      failed: false,
      busy: false,
    }),
  )
  expect(vi.mocked(SuccessNotice).mock.lastCall![0]).toEqual({
    message: 'Task deleted.',
  })
  expect(TodoEditor).not.toHaveBeenCalled()
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
})

it('treats missing data as no tasks while loading', () => {
  setup({ loaded: false, isPending: true })
  render(<TodosPage />)
  expect(vi.mocked(useTodoFilters)).toHaveBeenCalledWith([])
  expect(vi.mocked(TodosHeader).mock.lastCall![0].disabled).toBe(true)
  expect(listProps()).toEqual(
    expect.objectContaining({ hasTodos: false, loading: true }),
  )
})

it('disables creation while a task mutation is running', () => {
  setup({ busy: true })
  render(<TodosPage />)
  expect(vi.mocked(TodosHeader).mock.lastCall![0].disabled).toBe(true)
  expect(listProps().busy).toBe(true)
})

it('completes an active task and celebrates', async () => {
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockResolvedValue({ ...todoFixture, status: 'done' }),
  })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(todoFixture, 'done'))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: 7,
    input: { status: 'done' },
  })
  expect(notify).toHaveBeenCalledWith('Task marked as done. Well done!')
})

it('marks a done task as active again', async () => {
  const done = { ...todoFixture, status: 'done' as const }
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockResolvedValue(todoFixture),
  })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(done, 'open'))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: 7,
    input: { status: 'open' },
  })
  expect(notify).toHaveBeenCalledWith('Task marked as open.')
})

it('ignores a toggle while busy', async () => {
  const { mutateAsync, notify } = setup({ busy: true })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(todoFixture, 'done'))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('shows no notice when a toggle fails', async () => {
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockRejectedValue(new Error('Task not found.')),
  })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(todoFixture, 'done'))
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
})

it('starts work on a task and announces it', async () => {
  const { mutateAsync, notify } = setup({
    mutateAsync: vi.fn().mockResolvedValue({ ...todoFixture, status: 'doing' }),
  })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(todoFixture, 'doing'))
  expect(mutateAsync).toHaveBeenCalledExactlyOnceWith({
    id: 7,
    input: { status: 'doing' },
  })
  expect(notify).toHaveBeenCalledExactlyOnceWith('Task marked as doing.')
})

it('announces the status the server saved', async () => {
  const { notify } = setup({
    mutateAsync: vi.fn().mockResolvedValue({ ...todoFixture, status: 'done' }),
  })
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(todoFixture, 'doing'))
  expect(notify).toHaveBeenCalledExactlyOnceWith(
    'Task marked as done. Well done!',
  )
})

it('sends a status change for the task ID it was given', async () => {
  const { mutateAsync } = setup({
    mutateAsync: vi.fn().mockResolvedValue(todoFixture),
  })
  const far = { ...todoFixture, id: Number.MAX_SAFE_INTEGER }
  render(<TodosPage />)
  await act(async () => listProps().onStatusChange(far, 'open'))
  expect(mutateAsync).toHaveBeenCalledWith({
    id: Number.MAX_SAFE_INTEGER,
    input: { status: 'open' },
  })
})

it('shows the server message when a status change fails', () => {
  setup({ mutationError: new Error('Task not found.') })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Task not found.')
})

it('shows the mutation error before the query error and blocks retry while fetching', () => {
  setup({
    isFetching: true,
    queryError: new Error('Cannot connect to the server. Please try again.'),
    mutationError: new Error('Task not found.'),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Task not found.')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('blocks retry while busy', () => {
  setup({ busy: true, mutationError: new Error('Task not found.') })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('opens the editor for a new task from the header and closes it after saving', () => {
  const { notify } = setup()
  const { rerender } = render(<TodosPage />)
  act(() => vi.mocked(TodosHeader).mock.lastCall![0].onCreate())
  expect(editorProps()).toEqual(
    expect.objectContaining({ todo: 'new', busy: false }),
  )
  act(() => editorProps().onSaved('New task added.'))
  expect(notify).toHaveBeenCalledWith('New task added.')
  vi.mocked(TodoEditor).mockClear()
  rerender(<TodosPage />)
  expect(TodoEditor).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the empty list', () => {
  setup({ todos: [] })
  render(<TodosPage />)
  act(() => listProps().onCreate())
  expect(editorProps().todo).toBe('new')
})

it('opens the editor for a task and closes it without a notice', () => {
  const { notify } = setup()
  const { rerender } = render(<TodosPage />)
  act(() => listProps().onEdit(todoFixture))
  expect(editorProps().todo).toBe(todoFixture)
  act(() => editorProps().onClose())
  vi.mocked(TodoEditor).mockClear()
  rerender(<TodosPage />)
  expect(TodoEditor).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('confirms a deletion and reports it', () => {
  const { notify } = setup()
  const { rerender } = render(<TodosPage />)
  act(() => listProps().onDelete(todoFixture))
  expect(deleteProps()).toEqual(
    expect.objectContaining({ todo: todoFixture, busy: false }),
  )
  act(() => deleteProps().onDeleted())
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  vi.mocked(DeleteTodoDialog).mockClear()
  rerender(<TodosPage />)
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
})

it('closes the delete confirmation when cancelled', () => {
  const { notify } = setup()
  const { rerender } = render(<TodosPage />)
  act(() => listProps().onDelete(todoFixture))
  act(() => deleteProps().onClose())
  vi.mocked(DeleteTodoDialog).mockClear()
  rerender(<TodosPage />)
  expect(DeleteTodoDialog).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})
