import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('drops unknown and read-only fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  const input = JSON.parse(
    '{"title":"Plan","description":"Notes","priority":"high","due_date":"2026-11-01","completed":true,"id":99,"owner":"admin","__proto__":{"admin":true}}',
  )
  await todosApi.create(input)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Plan',
      description: 'Notes',
      priority: 'high',
      due_date: '2026-11-01',
      completed: true,
    }),
  })
})

it('patches only writable fields at the task path', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(
    todosApi.update(7, { ...todoFixture, completed: true }),
  ).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos/7', {
    method: 'PATCH',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: true,
    }),
  })
})

it('sends only the fields given in a partial update', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await todosApi.update(Number.MAX_SAFE_INTEGER, { completed: true })
  expect(request).toHaveBeenCalledWith(`/todos/${Number.MAX_SAFE_INTEGER}`, {
    method: 'PATCH',
    body: '{"completed":true}',
  })
})

it('deletes a task at its path', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(7)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith('/todos/7', { method: 'DELETE' })
})

it('surfaces a server rejection of an ID', async () => {
  vi.mocked(request).mockRejectedValue(new Error('Task not found.'))
  await expect(todosApi.remove(-1)).rejects.toThrow('Task not found.')
  expect(request).toHaveBeenCalledWith('/todos/-1', { method: 'DELETE' })
})
