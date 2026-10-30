import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Badge } from '../../../design-system'
import { todoFixture } from '../../../test/todoFixture'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('shows a done task with its description and forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  const todo = {
    ...todoFixture,
    completed: true,
    priority: 'high' as const,
    description: 'Slides and\nnotes',
    due_date: '2020-01-02',
  }
  render(
    <TodoItem
      todo={todo}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.getByText('High')).toBeVisible()
  expect(screen.getByText('#7')).toBeVisible()
  expect(screen.getByText(/Slides and/)).toHaveTextContent('Slides and notes')
  // A done task is never overdue, even with a past due date.
  expect(screen.getByText('2 Jan 2020')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(vi.mocked(Badge).mock.calls.map(([props]) => props.variant)).toEqual([
    'success',
    'neutral',
  ])
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todo.title}`,
  })
  expect(checkbox).toBeChecked()
  await user.click(checkbox)
  expect(onToggle).toHaveBeenCalledTimes(1)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todo.title}` }),
  )
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('marks an active task with a past due date as overdue', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12))
  render(
    <TodoItem
      todo={{ ...todoFixture, due_date: '2026-10-28' }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText(/28 Oct 2026/)).toHaveTextContent(
    '28 Oct 2026 · overdue',
  )
  expect(vi.mocked(Badge).mock.calls.map(([props]) => props.variant)).toEqual([
    'info',
    'warning',
  ])
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeVisible()
})

it('marks a task due today as due soon rather than overdue', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12))
  render(
    <TodoItem
      todo={{ ...todoFixture, due_date: '2026-10-29' }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText(/29 Oct 2026/)).toHaveTextContent(
    '29 Oct 2026 · due soon',
  )
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  expect(vi.mocked(Badge).mock.calls.map(([props]) => props.variant)).toEqual([
    'info',
    'info',
  ])
})

it('marks an active task due in 2 days as due soon', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12))
  render(
    <TodoItem
      todo={{ ...todoFixture, due_date: '2026-10-31' }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText(/31 Oct 2026/)).toHaveTextContent(
    '31 Oct 2026 · due soon',
  )
})

it('disables every control while busy', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  const checkbox = screen.getByRole('checkbox')
  const edit = screen.getByRole('button', {
    name: `Edit: ${todoFixture.title}`,
  })
  const remove = screen.getByRole('button', {
    name: `Delete: ${todoFixture.title}`,
  })
  for (const control of [checkbox, edit, remove]) {
    expect(control).toBeDisabled()
    await user.click(control)
  }
  expect(onToggle).not.toHaveBeenCalled()
  expect(onEdit).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('renders HTML in the title and description as text', () => {
  const html = '<img src=x onerror=alert(1)>'
  const { container } = render(
    <TodoItem
      todo={{ ...todoFixture, title: html, description: html }}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading', { name: html })).toBeVisible()
  expect(screen.getAllByText(html)).toHaveLength(2)
  expect(container.querySelector('img')).toBeNull()
})
