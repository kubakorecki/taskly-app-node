import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useClearDoneMutation } from './useClearDoneMutation'

vi.mock('../api/todos', () => ({ todosApi: { clearDone: vi.fn() } }))
beforeEach(() => vi.clearAllMocks())

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

it('removes only done tasks from the cached list', async () => {
  const { client, wrapper } = setup()
  const done: Todo = { ...todoFixture, id: 3, completed: true }
  const otherDone: Todo = { ...todoFixture, id: 4, completed: true }
  client.setQueryData<Todo[]>(todoKeys.list, [done, todoFixture, otherDone])
  vi.mocked(todosApi.clearDone).mockResolvedValue({ deleted: 2 })
  const { result } = renderHook(() => useClearDoneMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(todosApi.clearDone).toHaveBeenCalledTimes(1)
  expect(result.current.data).toEqual({ deleted: 2 })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('leaves an empty cache empty', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.clearDone).mockResolvedValue({ deleted: 0 })
  const { result } = renderHook(() => useClearDoneMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('exposes the server error and keeps done tasks cached', async () => {
  const { client, wrapper } = setup()
  const done: Todo = { ...todoFixture, completed: true }
  client.setQueryData<Todo[]>(todoKeys.list, [done])
  vi.mocked(todosApi.clearDone).mockRejectedValue(
    new Error('The operation failed. Please try again.'),
  )
  const { result } = renderHook(() => useClearDoneMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toEqual(
    new Error('The operation failed. Please try again.'),
  )
  expect(client.getQueryData(todoKeys.list)).toEqual([done])
})
