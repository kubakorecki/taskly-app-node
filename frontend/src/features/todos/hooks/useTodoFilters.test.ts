import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const done: Todo = {
  ...todoFixture,
  id: 8,
  title: 'Ship release',
  priority: 'high',
  completed: true,
}
const todos = [todoFixture, done]

it('starts with all tasks, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  expect(result.current.visible).toEqual([done, todoFixture])
})

it('applies the chosen filter, search and sort', () => {
  const { result } = renderHook(() => useTodoFilters(todos))
  act(() => result.current.setFilter('active'))
  expect(result.current.filter).toBe('active')
  expect(result.current.visible).toEqual([todoFixture])
  act(() => {
    result.current.setFilter('all')
    result.current.setSearch('ship')
  })
  expect(result.current.search).toBe('ship')
  expect(result.current.visible).toEqual([done])
  act(() => {
    result.current.setSearch('')
    result.current.setSort('priority')
  })
  expect(result.current.sort).toBe('priority')
  expect(result.current.visible).toEqual([done, todoFixture])
})
