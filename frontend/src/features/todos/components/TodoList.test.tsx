import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Status, Todo } from '../types'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: vi.fn(() => <p>Empty task list</p>),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onStatusChange,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onStatusChange: (status: Status) => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      {busy && ' (busy)'}
      <button onClick={() => onStatusChange('doing')}>Start {todo.id}</button>
      <button onClick={() => onStatusChange('done')}>Finish {todo.id}</button>
      <button onClick={onEdit}>Edit {todo.id}</button>
      <button onClick={onDelete}>Delete {todo.id}</button>
    </li>
  ),
}))
beforeEach(() => vi.clearAllMocks())

const callbacks = () => ({
  onCreate: vi.fn(),
  onStatusChange: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
})

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onStatusChange: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows an unavailable message when the first load fails', () => {
  render(
    <TodoList
      todos={[]}
      hasTodos={false}
      loading={false}
      failed
      busy={false}
      {...callbacks()}
    />,
  )
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks after a failed refetch and forwards each task', async () => {
  const user = userEvent.setup()
  const other: Todo = { ...todoFixture, id: 8, title: 'Ship release' }
  const props = callbacks()
  render(
    <TodoList
      todos={[todoFixture, other]}
      hasTodos
      loading={false}
      failed
      busy
      {...props}
    />,
  )
  expect(screen.getByRole('region', { name: 'Task list' })).toBeVisible()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText(/Ship release/)).toHaveTextContent(
    'Ship release (busy)',
  )
  await user.click(screen.getByRole('button', { name: 'Start 8' }))
  expect(props.onStatusChange).toHaveBeenCalledWith(other, 'doing')
  await user.click(screen.getByRole('button', { name: 'Edit 7' }))
  expect(props.onEdit).toHaveBeenCalledWith(todoFixture)
  await user.click(screen.getByRole('button', { name: 'Delete 8' }))
  expect(props.onDelete).toHaveBeenCalledWith(other)
  expect(props.onStatusChange).toHaveBeenCalledTimes(1)
  expect(props.onEdit).toHaveBeenCalledTimes(1)
  expect(props.onDelete).toHaveBeenCalledTimes(1)
  expect(props.onCreate).not.toHaveBeenCalled()
})

it('forwards the chosen status together with its own task', async () => {
  const user = userEvent.setup()
  const other: Todo = { ...todoFixture, id: 8, title: 'Ship release' }
  const props = callbacks()
  render(
    <TodoList
      todos={[todoFixture, other]}
      hasTodos
      loading={false}
      failed={false}
      busy={false}
      {...props}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Finish 7' }))
  expect(props.onStatusChange).toHaveBeenCalledExactlyOnceWith(
    todoFixture,
    'done',
  )
  expect(props.onEdit).not.toHaveBeenCalled()
  expect(props.onDelete).not.toHaveBeenCalled()
})

it('renders the title of each task as text', () => {
  const html = '<img src=x onerror=alert(1)>'
  const { container } = render(
    <TodoList
      todos={[{ ...todoFixture, title: html }]}
      hasTodos
      loading={false}
      failed={false}
      busy={false}
      {...callbacks()}
    />,
  )
  expect(screen.getByRole('listitem')).toHaveTextContent(html)
  expect(container.querySelector('img')).toBeNull()
})

it('passes the filter state and busy flag to the empty state', () => {
  const props = callbacks()
  render(
    <TodoList
      todos={[]}
      hasTodos
      loading={false}
      failed={false}
      busy
      {...props}
    />,
  )
  expect(vi.mocked(TodoEmptyState).mock.calls[0][0]).toEqual({
    hasTodos: true,
    disabled: true,
    onCreate: props.onCreate,
  })
})
