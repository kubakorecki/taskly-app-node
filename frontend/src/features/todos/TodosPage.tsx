import { useState } from 'react'
import { Alert, Button } from '../../design-system'
import { SuccessNotice } from '../../components/SuccessNotice'
import { useNotice } from '../../hooks/useNotice'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoFilters } from './components/TodoFilters'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import type { Status, Todo } from './types'

const statusNotices: Record<Status, string> = {
  open: 'Task marked as open.',
  doing: 'Task marked as doing.',
  done: 'Task marked as done. Well done!',
}

export function TodosPage() {
  const todosQuery = useTodosQuery()
  const todos = todosQuery.data ?? []
  const filters = useTodoFilters(todos)
  const updateStatus = useUpdateTodoMutation()
  const busy = useTodosBusy()
  const { message, notify } = useNotice()
  const [editor, setEditor] = useState<Todo | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Todo | null>(null)
  const error = updateStatus.error ?? todosQuery.error

  async function changeStatus(todo: Todo, status: Status) {
    if (busy) return
    try {
      const saved = await updateStatus.mutateAsync({
        id: todo.id,
        input: { status },
      })
      notify(statusNotices[saved.status])
    } catch {
      // Display the mutation error in the page alert.
    }
  }
  async function retry() {
    updateStatus.reset()
    await todosQuery.refetch()
  }

  return (
    <>
      <main id="main" className="page-layout">
        <TodosHeader
          disabled={todosQuery.isPending || busy}
          onCreate={() => setEditor('new')}
        />
        <TodoFilters
          filter={filters.filter}
          search={filters.search}
          sort={filters.sort}
          onFilterChange={filters.setFilter}
          onSearchChange={filters.setSearch}
          onSortChange={filters.setSort}
        />
        {error && (
          <Alert variant="warning">
            {error.message}
            <Button
              variant="secondary"
              disabled={todosQuery.isFetching || busy}
              onClick={() => void retry()}
            >
              Try again
            </Button>
          </Alert>
        )}
        <TodoList
          todos={filters.visible}
          hasTodos={todos.length > 0}
          loading={todosQuery.isPending}
          failed={todosQuery.isError}
          busy={busy}
          onCreate={() => setEditor('new')}
          onStatusChange={(todo, status) => void changeStatus(todo, status)}
          onEdit={setEditor}
          onDelete={setDeleting}
        />
      </main>
      <SuccessNotice message={message} />
      {editor && (
        <TodoEditor
          todo={editor}
          busy={busy}
          onClose={() => setEditor(null)}
          onSaved={(notice) => {
            setEditor(null)
            notify(notice)
          }}
        />
      )}
      {deleting && (
        <DeleteTodoDialog
          todo={deleting}
          busy={busy}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            notify('Task deleted.')
          }}
        />
      )}
    </>
  )
}
