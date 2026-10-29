import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodoFilters } from './TodoFilters'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('displays controlled values and forwards all filter changes', async () => {
  const user = userEvent.setup()
  const callbacks = {
    onFilterChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
  }
  const { rerender } = render(
    <TodoFilters filter="all" search="" sort="newest" {...callbacks} />,
  )
  await user.type(screen.getByLabelText('Search tasks'), 'a')
  await user.selectOptions(screen.getByLabelText('Status'), 'done')
  await user.selectOptions(screen.getByLabelText('Sort by'), 'due')
  expect(callbacks.onSearchChange).toHaveBeenCalledWith('a')
  expect(callbacks.onFilterChange).toHaveBeenCalledWith('done')
  expect(callbacks.onSortChange).toHaveBeenCalledWith('due')
  rerender(
    <TodoFilters filter="done" search="demo" sort="due" {...callbacks} />,
  )
  expect(screen.getByLabelText('Search tasks')).toHaveValue('demo')
  expect(screen.getByLabelText('Status')).toHaveValue('done')
  expect(screen.getByLabelText('Sort by')).toHaveValue('due')
})

const optionsOf = (select: HTMLElement) =>
  Array.from(select.querySelectorAll('option'), (option) => [
    option.value,
    option.textContent,
  ])

it('offers all, active and every status as filters, and the sort orders', () => {
  render(
    <TodoFilters
      filter="all"
      search=""
      sort="newest"
      onFilterChange={vi.fn()}
      onSearchChange={vi.fn()}
      onSortChange={vi.fn()}
    />,
  )
  expect(optionsOf(screen.getByLabelText('Status'))).toEqual([
    ['all', 'All'],
    ['active', 'Active'],
    ['open', 'Open'],
    ['doing', 'Doing'],
    ['done', 'Done'],
  ])
  expect(optionsOf(screen.getByLabelText('Sort by'))).toEqual([
    ['newest', 'Newest'],
    ['priority', 'Priority'],
    ['due', 'Due date'],
  ])
})

it.each(['active', 'open', 'doing'] as const)(
  'forwards the %s filter without touching search or sort',
  async (filter) => {
    const user = userEvent.setup()
    const callbacks = {
      onFilterChange: vi.fn(),
      onSearchChange: vi.fn(),
      onSortChange: vi.fn(),
    }
    render(<TodoFilters filter="all" search="" sort="newest" {...callbacks} />)
    await user.selectOptions(screen.getByLabelText('Status'), filter)
    expect(callbacks.onFilterChange).toHaveBeenCalledExactlyOnceWith(filter)
    expect(callbacks.onSearchChange).not.toHaveBeenCalled()
    expect(callbacks.onSortChange).not.toHaveBeenCalled()
  },
)

it('keeps a search with HTML as plain text', () => {
  const html = '<img src=x onerror=alert(1)>'
  const { container } = render(
    <TodoFilters
      filter="all"
      search={html}
      sort="newest"
      onFilterChange={vi.fn()}
      onSearchChange={vi.fn()}
      onSortChange={vi.fn()}
    />,
  )
  expect(screen.getByLabelText('Search tasks')).toHaveValue(html)
  expect(container.querySelector('img')).toBeNull()
})
