import { render, screen, within } from '@testing-library/react'
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
  const onStatusChange = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('Open', { selector: 'span' })).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(
    screen.getByRole('combobox', { name: `Status: ${todoFixture.title}` }),
  ).toHaveValue('open')
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onStatusChange).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

it('shows a done task with its description and forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onStatusChange = vi.fn()
  const onDelete = vi.fn()
  const todo = {
    ...todoFixture,
    status: 'done' as const,
    priority: 'high' as const,
    description: 'Slides and\nnotes',
    due_date: '2020-01-02',
  }
  render(
    <TodoItem
      todo={todo}
      busy={false}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByText('Done', { selector: 'span' })).toBeVisible()
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
  const select = screen.getByRole('combobox', {
    name: `Status: ${todo.title}`,
  })
  expect(select).toHaveValue('done')
  await user.selectOptions(select, 'open')
  expect(onStatusChange).toHaveBeenCalledExactlyOnceWith('open')
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
      onStatusChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText(/28 Oct 2026/)).toHaveTextContent(
    '28 Oct 2026 · overdue',
  )
  expect(vi.mocked(Badge).mock.calls.map(([props]) => props.variant)).toEqual([
    'neutral',
    'warning',
  ])
  expect(
    screen.getByRole('combobox', { name: `Status: ${todoFixture.title}` }),
  ).toBeVisible()
})

it('shows a task due today without the overdue mark', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12))
  render(
    <TodoItem
      todo={{ ...todoFixture, due_date: '2026-10-29' }}
      busy={false}
      onEdit={vi.fn()}
      onStatusChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText('29 Oct 2026')).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('disables every control while busy', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onStatusChange = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy
      onEdit={onEdit}
      onStatusChange={onStatusChange}
      onDelete={onDelete}
    />,
  )
  const select = screen.getByRole('combobox')
  const edit = screen.getByRole('button', {
    name: `Edit: ${todoFixture.title}`,
  })
  const remove = screen.getByRole('button', {
    name: `Delete: ${todoFixture.title}`,
  })
  for (const control of [select, edit, remove]) {
    expect(control).toBeDisabled()
    await user.click(control)
  }
  expect(onStatusChange).not.toHaveBeenCalled()
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
      onStatusChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading', { name: html })).toBeVisible()
  expect(screen.getAllByText(html)).toHaveLength(2)
  expect(container.querySelector('img')).toBeNull()
})

it('shows a doing task as active and overdue with an info badge', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 29, 12))
  render(
    <TodoItem
      todo={{ ...todoFixture, status: 'doing', due_date: '2026-10-28' }}
      busy={false}
      onEdit={vi.fn()}
      onStatusChange={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.getByText('Doing', { selector: 'span' })).toBeVisible()
  expect(screen.getByText(/28 Oct 2026/)).toHaveTextContent(
    '28 Oct 2026 · overdue',
  )
  expect(vi.mocked(Badge).mock.calls.map(([props]) => props.variant)).toEqual([
    'info',
    'warning',
  ])
  expect(
    screen.getByRole('combobox', { name: `Status: ${todoFixture.title}` }),
  ).toHaveValue('doing')
})

it('offers every status and forwards the chosen one', async () => {
  const user = userEvent.setup()
  const onStatusChange = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onStatusChange={onStatusChange}
      onDelete={onDelete}
    />,
  )
  const select = screen.getByRole('combobox', {
    name: `Status: ${todoFixture.title}`,
  })
  expect(
    within(select)
      .getAllByRole('option')
      .map((option) => [option.getAttribute('value'), option.textContent]),
  ).toEqual([
    ['open', 'Open'],
    ['doing', 'Doing'],
    ['done', 'Done'],
  ])
  await user.selectOptions(select, 'doing')
  await user.selectOptions(select, 'done')
  expect(onStatusChange.mock.calls).toEqual([['doing'], ['done']])
  expect(onEdit).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})
