import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      status: 'open',
    })
  })

  it('offers every priority in order', () => {
    render(
      <TodoForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    const priority = screen.getByLabelText('Priority')
    expect(priority).toHaveValue('medium')
    expect(
      Array.from(priority.querySelectorAll('option')).map((option) => [
        option.value,
        option.textContent,
      ]),
    ).toEqual([
      ['low', 'Low'],
      ['medium', 'Medium'],
      ['high', 'High'],
    ])
  })

  it('keeps the status of an edited task', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{ ...todoFixture, status: 'doing' }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'doing' }),
    )
  })

  it('rejects an empty title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('accepts a 120-character title and rejects 121', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    const title = screen.getByLabelText(/Task title/)
    await user.click(title)
    await user.paste('a'.repeat(121))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(
      screen.getByText('The title must be at most 120 characters.'),
    ).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.type(title, '{Backspace}')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(
      screen.queryByText('The title must be at most 120 characters.'),
    ).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'a'.repeat(120) }),
    )
  })

  it('accepts a 2000-character description and rejects 2001', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{ ...todoFixture, description: 'a'.repeat(2001) }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(
      screen.getByText('The description must be at most 2000 characters.'),
    ).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
    await user.type(screen.getByLabelText(/Description/), '{Backspace}')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'a'.repeat(2000) }),
    )
  })

  it('edits an existing task and submits only the form fields', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{ ...todoFixture, due_date: '2026-11-01' }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    expect(screen.getByLabelText(/Task title/)).toHaveValue(todoFixture.title)
    expect(screen.getByLabelText('Due date (optional)')).toHaveValue(
      '2026-11-01',
    )
    await user.type(
      screen.getByLabelText('Description (optional)'),
      '  Slides  ',
    )
    fireEvent.change(screen.getByLabelText('Due date (optional)'), {
      target: { value: '' },
    })
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      ...todoFixture,
      description: 'Slides',
      due_date: null,
    })
  })

  it('submits a chosen due date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), 'Plan')
    fireEvent.change(screen.getByLabelText('Due date (optional)'), {
      target: { value: '2026-11-01' },
    })
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Plan', due_date: '2026-11-01' }),
    )
  })

  it('shows the server error and cancels without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy={false}
        error="Task not found."
      />,
    )
    expect(screen.getByTestId('alert')).toHaveTextContent('Task not found.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the fields and actions while busy', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={todoFixture}
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy
        error={null}
      />,
    )
    expect(screen.getByLabelText(/Task title/)).toBeDisabled()
    const save = screen.getByRole('button', { name: 'Saving…' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(save).toBeDisabled()
    expect(cancel).toBeDisabled()
    await user.click(save)
    await user.click(cancel)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('keeps HTML in a title as plain text', async () => {
    const html = '<img src=x onerror=alert(1)>'
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    const { container } = render(
      <TodoForm
        initial={{ ...todoFixture, title: html }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    expect(screen.getByLabelText(/Task title/)).toHaveValue(html)
    expect(container.querySelector('img')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: html }),
    )
  })
})
