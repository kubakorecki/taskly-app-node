import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: vi.fn(
    ({ onSubmit }: { onSubmit: (input: TodoInput) => Promise<void> }) => (
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
    ),
  ),
}))
beforeEach(() => vi.clearAllMocks())

function mockMutations({
  create = vi.fn(),
  update = vi.fn(),
  createPending = false,
  updatePending = false,
  createError = null as Error | null,
  updateError = null as Error | null,
} = {}) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: createPending,
    error: createError,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: updatePending,
    error: updateError,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  return { create, update }
}

const formProps = () => vi.mocked(TodoForm).mock.lastCall![0]

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('updates an existing task and reports saved changes', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations({
    update: vi.fn().mockResolvedValue(todoFixture),
  })
  const onSaved = vi.fn()
  const onClose = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(formProps()).toEqual(
    expect.objectContaining({
      initial: todoFixture,
      busy: false,
      error: null,
      onCancel: onClose,
    }),
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({ id: 7, input: todoFixture })
  expect(create).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it('passes the matching mutation error to the form and keeps it open on failure', async () => {
  const user = userEvent.setup()
  const { update } = mockMutations({
    update: vi.fn().mockRejectedValue(new Error('Task not found.')),
    updateError: new Error('Task not found.'),
    createError: new Error('Create failed.'),
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(formProps().error).toBe('Task not found.')
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it('passes the create error for a new task', () => {
  mockMutations({ createError: new Error('Create failed.') })
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(formProps()).toEqual(
    expect.objectContaining({ initial: undefined, error: 'Create failed.' }),
  )
})

it('saves nothing while the page is busy', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations()
  const onSaved = vi.fn()
  render(<TodoEditor todo="new" busy onClose={vi.fn()} onSaved={onSaved} />)
  expect(formProps().busy).toBe(true)
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('saves nothing while its own mutation is pending', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations({ updatePending: true })
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(formProps().busy).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(update).not.toHaveBeenCalled()
  expect(create).not.toHaveBeenCalled()
})
