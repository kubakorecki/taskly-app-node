import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { expect, it } from 'vitest'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

function useBusyWith(mutationKey: readonly string[]) {
  const mutation = useMutation({
    mutationKey,
    mutationFn: (done: Promise<void>) => done,
  })
  return { busy: useTodosBusy(), mutation }
}

it('is busy while any task mutation is running', async () => {
  const { wrapper } = setup()
  let finish = () => {}
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  const { result } = renderHook(() => useBusyWith(todoKeys.update), {
    wrapper,
  })
  expect(result.current.busy).toBe(false)
  act(() => result.current.mutation.mutate(done))
  await waitFor(() => expect(result.current.busy).toBe(true))
  act(() => finish())
  await waitFor(() => expect(result.current.busy).toBe(false))
})

it('ignores mutations outside the task keys', async () => {
  const { wrapper } = setup()
  const { result } = renderHook(() => useBusyWith(['settings']), { wrapper })
  act(() => result.current.mutation.mutate(new Promise<void>(() => {})))
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))
  expect(result.current.busy).toBe(false)
})
