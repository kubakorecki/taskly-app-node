import { request } from '../../../lib/http'
import type { Todo, TodoInput } from '../types'

export const todosApi = {
  list: (signal?: AbortSignal) => request<Todo[]>('/todos', { signal }),
  create: (input: TodoInput) => {
    // A form initialized with a Todo must never send read-only fields.
    const { title, description, priority, due_date, status } = input
    return request<Todo>('/todos', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description,
        priority,
        due_date,
        status,
      }),
    })
  },
  update: (id: number, input: Partial<TodoInput>) => {
    const { title, description, priority, due_date, status } = input
    return request<Todo>(`/todos/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        title,
        description,
        priority,
        due_date,
        status,
      }),
    })
  },
  remove: (id: number) => request<void>(`/todos/${id}`, { method: 'DELETE' }),
}
