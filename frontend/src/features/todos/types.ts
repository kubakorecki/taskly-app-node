export type Priority = 'low' | 'medium' | 'high'
export type Status = 'open' | 'doing' | 'done'
export interface TodoInput {
  title: string
  description: string
  priority: Priority
  due_date: string | null
  status: Status
}
export interface Todo extends TodoInput {
  id: number
  created_at: string
  updated_at: string
}
export type Filter = 'all' | 'active' | Status
export type Sort = 'newest' | 'priority' | 'due'
