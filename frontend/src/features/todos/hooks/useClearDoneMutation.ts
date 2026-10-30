import { useMutation, useQueryClient } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'

export function useClearDoneMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: todoKeys.clearDone,
    mutationFn: () => todosApi.clearDone(),
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: todoKeys.list })
      queryClient.setQueryData<Todo[]>(todoKeys.list, (current) =>
        current?.filter((todo) => !todo.completed),
      )
    },
  })
}
