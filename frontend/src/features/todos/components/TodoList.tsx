import { Card, Heading, Text } from '../../../design-system'
import type { Status, Todo } from '../types'
import { TodoEmptyState } from './TodoEmptyState'
import { TodoItem } from './TodoItem'

interface TodoListProps {
  todos: Todo[]
  hasTodos: boolean
  loading: boolean
  failed: boolean
  busy: boolean
  onCreate: () => void
  onStatusChange: (todo: Todo, status: Status) => void
  onEdit: (todo: Todo) => void
  onDelete: (todo: Todo) => void
}

export function TodoList({
  todos,
  hasTodos,
  loading,
  failed,
  busy,
  onCreate,
  onStatusChange,
  onEdit,
  onDelete,
}: TodoListProps) {
  return (
    <section aria-label="Task list">
      {loading ? (
        <Card>
          <Text role="status">Loading your tasks…</Text>
        </Card>
      ) : failed && !hasTodos ? (
        <Card>
          <Heading level={3}>The task list is temporarily unavailable</Heading>
          <Text muted>Try again to load your tasks.</Text>
        </Card>
      ) : todos.length ? (
        <ul className="todo-list stack compact">
          {todos.map((todo) => (
            <TodoItem
              key={todo.id}
              todo={todo}
              busy={busy}
              onStatusChange={(status) => onStatusChange(todo, status)}
              onEdit={() => onEdit(todo)}
              onDelete={() => onDelete(todo)}
            />
          ))}
        </ul>
      ) : (
        <TodoEmptyState
          hasTodos={hasTodos}
          disabled={busy}
          onCreate={onCreate}
        />
      )}
    </section>
  )
}
