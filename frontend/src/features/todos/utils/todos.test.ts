import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  formatDate,
  isDueSoon,
  isOverdue,
  selectTodos,
  validateTodo,
} from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('keeps only done tasks for the completed filter', () => {
    const done = { ...base, id: 2, completed: true }
    expect(selectTodos([base, done], 'completed', '', 'newest')).toEqual([done])
  })

  it('searches the title', () => {
    const other = { ...base, id: 2, title: 'Write report' }
    expect(selectTodos([base, other], 'all', 'SPRINT', 'newest')).toEqual([
      base,
    ])
  })

  it('sorts by due date with undated tasks last and ties by newest ID', () => {
    const early = { ...base, id: 2, due_date: '2026-10-02' }
    const late = { ...base, id: 3, due_date: '2026-11-02' }
    const undated = { ...base, id: 4 }
    expect(selectTodos([base, late, undated, early], 'all', '', 'due')).toEqual(
      [early, late, undated, base],
    )
  })

  it('sorts by newest creation and then by newest ID', () => {
    const newer = { ...base, id: 2, created_at: '2026-10-05T12:00:00Z' }
    const sameTime = { ...base, id: 3 }
    expect(selectTodos([base, newer, sameTime], 'all', '', 'newest')).toEqual([
      newer,
      sameTime,
      base,
    ])
  })

  it('ties equal priorities by newest ID', () => {
    const second = { ...base, id: 2 }
    expect(selectTodos([base, second], 'all', '', 'priority')).toEqual([
      second,
      base,
    ])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Plan',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it('accepts a valid task', () => {
    expect(validateTodo(valid)).toEqual({})
  })

  it('rejects an empty or whitespace-only title', () => {
    expect(validateTodo({ ...valid, title: '' })).toEqual({
      title: 'Enter a task title.',
    })
    expect(validateTodo({ ...valid, title: ' \t ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it('accepts a 120-character title and rejects 121', () => {
    expect(validateTodo({ ...valid, title: 'a'.repeat(120) })).toEqual({})
    expect(validateTodo({ ...valid, title: ` ${'a'.repeat(120)} ` })).toEqual(
      {},
    )
    expect(validateTodo({ ...valid, title: 'a'.repeat(121) })).toEqual({
      title: 'The title must be at most 120 characters.',
    })
  })

  it('accepts a 2000-character description and rejects 2001', () => {
    expect(validateTodo({ ...valid, description: 'a'.repeat(2000) })).toEqual(
      {},
    )
    expect(validateTodo({ ...valid, description: 'a'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it('accepts a real calendar date', () => {
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })

  it.each(['tomorrow', '2026-1-01', '2026-13-01', '2026-02-30'])(
    'rejects the due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )
})

describe('isOverdue', () => {
  afterEach(() => vi.useRealTimers())

  it('flags only active tasks due before the local today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 29, 0, 30))
    expect(isOverdue({ ...base, due_date: '2026-10-28' })).toBe(true)
    expect(isOverdue({ ...base, due_date: '2026-10-29' })).toBe(false)
    expect(
      isOverdue({ ...base, due_date: '2026-10-28', completed: true }),
    ).toBe(false)
    expect(isOverdue(base)).toBe(false)
  })
})

describe('isDueSoon', () => {
  afterEach(() => vi.useRealTimers())

  it('flags tasks due from the local today through the next 2 days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 29, 0, 30))
    expect(isDueSoon({ ...base, due_date: '2026-10-29' })).toBe(true)
    expect(isDueSoon({ ...base, due_date: '2026-10-31' })).toBe(true)
    expect(isDueSoon({ ...base, due_date: '2026-11-01' })).toBe(false)
    expect(isDueSoon({ ...base, due_date: '2026-10-28' })).toBe(false)
    expect(isDueSoon(base)).toBe(false)
  })

  it('carries the 2-day window over month and year ends', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 30, 23, 30))
    expect(isDueSoon({ ...base, due_date: '2026-11-01' })).toBe(true)
    expect(isDueSoon({ ...base, due_date: '2026-11-02' })).toBe(false)
    vi.setSystemTime(new Date(2026, 11, 31, 0, 5))
    expect(isDueSoon({ ...base, due_date: '2027-01-02' })).toBe(true)
    expect(isDueSoon({ ...base, due_date: '2027-01-03' })).toBe(false)
    expect(isDueSoon({ ...base, due_date: '2026-12-30' })).toBe(false)
  })
})

describe('formatDate', () => {
  it('formats a calendar day in British style', () => {
    expect(formatDate('2026-10-29')).toBe('29 Oct 2026')
  })
})
