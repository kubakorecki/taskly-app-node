import { CalendarDays, Pencil, Trash2 } from 'lucide-react'
import type { Status, Todo } from '../types'
import {
  formatDate,
  isOverdue,
  priorityLabels,
  statusLabels,
  toOptions,
} from '../utils/todos'
import {
  Badge,
  type BadgeVariant,
  Card,
  Heading,
  IconButton,
  Select,
  Text,
} from '../../../design-system'

const statusVariants: Record<Status, BadgeVariant> = {
  open: 'neutral',
  doing: 'info',
  done: 'success',
}

export function TodoItem({
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
}) {
  return (
    <li>
      <Card>
        <div className="todo-row">
          <div className="todo-content stack compact">
            <Heading level={3}>{todo.title}</Heading>
            {todo.description && (
              <Text muted preserveWhitespace>
                {todo.description}
              </Text>
            )}
            <div className="row compact">
              <Text as="span" muted size="small">
                #{todo.id}
              </Text>
              <Badge variant={statusVariants[todo.status]}>
                {statusLabels[todo.status]}
              </Badge>
              <Text as="span" muted size="small">
                {priorityLabels[todo.priority]}
              </Text>
              {todo.due_date && (
                <Badge variant={isOverdue(todo) ? 'warning' : 'neutral'}>
                  <span className="row compact">
                    <CalendarDays size={14} aria-hidden="true" />
                    {formatDate(todo.due_date)}
                    {isOverdue(todo) && ' · overdue'}
                  </span>
                </Badge>
              )}
            </div>
          </div>
          <div className="row compact todo-actions">
            <Select
              value={todo.status}
              disabled={busy}
              onChange={(event) => onStatusChange(event.target.value as Status)}
              aria-label={`Status: ${todo.title}`}
              options={toOptions(statusLabels)}
            />
            <IconButton
              variant="ghost"
              disabled={busy}
              onClick={onEdit}
              aria-label={`Edit: ${todo.title}`}
            >
              <Pencil size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              variant="ghost"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Delete: ${todo.title}`}
            >
              <Trash2 size={16} aria-hidden="true" />
            </IconButton>
          </div>
        </div>
      </Card>
    </li>
  )
}
