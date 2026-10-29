import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { Button } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { useDeleteTodoMutation } from '../hooks/useDeleteTodoMutation'
import { DeleteTodoDialog } from './DeleteTodoDialog'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useDeleteTodoMutation', () => ({
  useDeleteTodoMutation: vi.fn(),
}))
// Reset restores the design-system mocks' own implementations between tests.
beforeEach(() => vi.resetAllMocks())

function mockDelete(
  mutateAsync = vi.fn(),
  { isPending = false, error = null as Error | null } = {},
) {
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending,
    error,
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  return mutateAsync
}

it('shows a deletion error and allows cancelling without deleting', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  vi.mocked(useDeleteTodoMutation).mockReturnValue({
    isPending: false,
    error: new Error('Could not delete.'),
    mutateAsync,
  } as unknown as ReturnType<typeof useDeleteTodoMutation>)
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
  expect(
    screen.getByText(
      `The task “${todoFixture.title}” will be permanently deleted.`,
    ),
  ).toBeVisible()
  expect(screen.getByTestId('alert')).toHaveTextContent('Could not delete.')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

it('deletes the task by its ID and reports the deletion', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete(vi.fn().mockResolvedValue(undefined))
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={{ ...todoFixture, id: Number.MAX_SAFE_INTEGER }}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
  expect(mutateAsync).toHaveBeenCalledWith(Number.MAX_SAFE_INTEGER)
  expect(onClose).not.toHaveBeenCalled()
})

it('stays open when the deletion fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete(
    vi.fn().mockRejectedValue(new Error('Task not found.')),
  )
  const onClose = vi.fn()
  const onDeleted = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Delete task' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(7))
  expect(onDeleted).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Delete task?' })).toBeVisible()
})

it('disables every action while the deletion is pending', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete(vi.fn(), { isPending: true })
  const onClose = vi.fn()
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy={false}
      onClose={onClose}
      onDeleted={vi.fn()}
    />,
  )
  const remove = screen.getByRole('button', { name: 'Deleting…' })
  for (const button of [
    remove,
    screen.getByRole('button', { name: 'Cancel' }),
    screen.getByRole('button', { name: 'Close' }),
  ]) {
    expect(button).toBeDisabled()
    await user.click(button)
  }
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
})

it('ignores a delete request while the page is busy', async () => {
  const user = userEvent.setup()
  const mutateAsync = mockDelete()
  const onDeleted = vi.fn()
  // Let the button fire despite being disabled, to reach the busy guard.
  vi.mocked(Button).mockImplementation(({ onClick, children }) => (
    <button onClick={onClick}>{children}</button>
  ))
  render(
    <DeleteTodoDialog
      todo={todoFixture}
      busy
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Deleting…' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onDeleted).not.toHaveBeenCalled()
})

it('renders HTML in the task title as text', () => {
  mockDelete()
  const html = '<img src=x onerror=alert(1)>'
  const { container } = render(
    <DeleteTodoDialog
      todo={{ ...todoFixture, title: html }}
      busy={false}
      onClose={vi.fn()}
      onDeleted={vi.fn()}
    />,
  )
  expect(
    screen.getByText(`The task “${html}” will be permanently deleted.`),
  ).toBeVisible()
  expect(container.querySelector('img')).toBeNull()
})
