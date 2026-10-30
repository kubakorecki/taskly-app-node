import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      doneCount={0}
      onCreate={onCreate}
      onClearDone={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled
      doneCount={0}
      onCreate={onCreate}
      onClearDone={vi.fn()}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('clears done tasks only when there are some and the page is idle', async () => {
  const user = userEvent.setup()
  const onClearDone = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      doneCount={0}
      onCreate={vi.fn()}
      onClearDone={onClearDone}
    />,
  )
  const button = screen.getByRole('button', { name: 'Clear done tasks' })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onClearDone).not.toHaveBeenCalled()
  rerender(
    <TodosHeader
      disabled={false}
      doneCount={2}
      onCreate={vi.fn()}
      onClearDone={onClearDone}
    />,
  )
  expect(button).toBeEnabled()
  await user.click(button)
  expect(onClearDone).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled
      doneCount={2}
      onCreate={vi.fn()}
      onClearDone={onClearDone}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onClearDone).toHaveBeenCalledTimes(1)
})
