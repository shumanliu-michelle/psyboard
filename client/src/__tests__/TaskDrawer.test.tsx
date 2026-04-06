import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskDrawer } from '../components/TaskDrawer'
import { api } from '../api'
import type { Task } from '../types'

// Mock the API module
vi.mock('../api', () => ({
  api: {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}))

const mockTask: Task = {
  id: 't1', title: 'Existing task', columnId: 'col-backlog', order: 0,
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
}

describe('TaskDrawer — create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with title input and all fields', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByPlaceholderText('Task title')).toBeTruthy()
    expect(screen.getByText('Description')).toBeTruthy()
    expect(screen.getByText('Do date')).toBeTruthy()
    expect(screen.getByText('Due date')).toBeTruthy()
    expect(screen.getByText('Priority')).toBeTruthy()
    expect(screen.getByText('Assignee')).toBeTruthy()
  })

  it('pre-fills title when initialTitle is provided', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" initialTitle="My task" onClose={() => {}} onSaved={() => {}} />)
    expect((screen.getByPlaceholderText('Task title') as HTMLInputElement).value).toBe('My task')
  })

  it('Save button is disabled when title is empty', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('Save') as HTMLButtonElement).toBeDisabled()
  })

  it('Save button is enabled when title is filled', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'New task' } })
    expect(screen.getByText('Save') as HTMLButtonElement).not.toBeDisabled()
  })

  it('calls createTask when Save is clicked', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as Task)
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={onClose} onSaved={onSaved} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'New task' } })
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => {
      expect(vi.mocked(api.createTask)).toHaveBeenCalledWith(expect.objectContaining({ title: 'New task', columnId: 'col-backlog' }))
    })
  })

  it('passes assignee to createTask when set', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as Task)
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Task with assignee' } })
    // Click SL assignee button
    fireEvent.click(screen.getByRole('button', { name: 'SL' }))
    fireEvent.click(screen.getByText('Save'))
    await vi.waitFor(() => {
      expect(vi.mocked(api.createTask)).toHaveBeenCalledWith(expect.objectContaining({ assignee: 'SL' }))
    })
  })

  it('closes drawer after successful create (prevents duplicate saves)', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as Task)
    const onClose = vi.fn()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'New task' } })
    fireEvent.click(screen.getByText('Save'))
    await new Promise(r => setTimeout(r, 0))
    expect(onClose).toHaveBeenCalled()
  })

  it('closes when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDrawer — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Mark done and Delete buttons', () => {
    render(<TaskDrawer mode="edit" task={mockTask} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('Mark done')).toBeTruthy()
    expect(screen.getByText('Delete task')).toBeTruthy()
  })

  it('pre-fills form with task data', () => {
    render(<TaskDrawer mode="edit" task={mockTask} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect((screen.getByPlaceholderText('Task title') as HTMLInputElement).value).toBe('Existing task')
  })

  it('header shows task title in edit mode', () => {
    render(<TaskDrawer mode="edit" task={mockTask} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByText('Existing task')).toBeTruthy()
  })

  it('Mark done closes the drawer', async () => {
    vi.mocked(api.updateTask).mockResolvedValue({ ...mockTask, columnId: 'col-done' } as Task)
    const onClose = vi.fn()
    render(<TaskDrawer mode="edit" task={mockTask} columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.click(screen.getByText('Mark done'))
    await new Promise(r => setTimeout(r, 0))
    expect(onClose).toHaveBeenCalled()
  })

  it('save closes drawer after successful edit', async () => {
    vi.mocked(api.updateTask).mockResolvedValue(mockTask)
    const onClose = vi.fn()
    render(<TaskDrawer mode="edit" task={mockTask} columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Updated' } })
    fireEvent.click(screen.getByText('Save'))
    await new Promise(r => setTimeout(r, 0))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDrawer — recurrence fields', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders recurrence select with all options', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByRole('combobox', { name: /repeat/i })).toBeInTheDocument()
  })

  it('shows interval input when Every X days is selected', async () => {
    const user = userEvent.setup()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await user.selectOptions(select, 'interval_days')
    expect(screen.getByRole('spinbutton', { id: 'recurrence-interval' })).toBeInTheDocument()
  })

  it('shows mode toggle when recurrence is set', async () => {
    const user = userEvent.setup()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await user.selectOptions(select, 'daily')
    expect(screen.getByText(/fixed schedule/i)).toBeInTheDocument()
    expect(screen.getByText(/completion-based/i)).toBeInTheDocument()
  })

  it('shows validation error when recurrence set with no dates', async () => {
    const user = userEvent.setup()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await user.selectOptions(select, 'daily')
    expect(screen.getByText(/Recurring tasks must have at least a do date or due date/i)).toBeInTheDocument()
  })

  it('includes recurrence in createTask call', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as Task)
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    await user.type(screen.getByLabelText(/title/i), 'Daily Standup')
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await user.selectOptions(select, 'daily')
    await user.type(screen.getByLabelText(/do date/i), '2026-04-05')
    await user.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(vi.mocked(api.createTask)).toHaveBeenCalledWith(
        expect.objectContaining({
          recurrence: { kind: 'daily', mode: 'fixed' },
        })
      )
    })
  })
})

describe('TaskDrawer — recurring task delete', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('delete all calls suppressNext then delete', async () => {
    const task = { ...mockTask, recurrence: { kind: 'daily' as const, mode: 'fixed' as const }, id: 'task-recurring' }
    vi.mocked(api.updateTask).mockResolvedValue(task as Task)
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)

    render(<TaskDrawer mode="edit" task={task as Task} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /delete all future/i }))
    // Confirm in the inline dialog (exact match on "Delete")
    fireEvent.click(screen.getByText('Delete', { exact: true }))

    expect(vi.mocked(api.updateTask)).toHaveBeenCalledWith(
      'task-recurring',
      expect.objectContaining({ columnId: 'col-done', suppressNextOccurrence: true })
    )
    await waitFor(() => {
      expect(vi.mocked(api.deleteTask)).toHaveBeenCalledWith('task-recurring')
    })
  })

  it('delete single occurrence creates next occurrence then deletes', async () => {
    const task = { ...mockTask, recurrence: { kind: 'daily' as const, mode: 'fixed' as const }, id: 'task-recurring' }
    vi.mocked(api.updateTask).mockResolvedValue(task as Task)
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)

    render(<TaskDrawer mode="edit" task={task as Task} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /delete this occurrence/i }))
    // Confirm in the inline dialog (exact match on "Delete")
    fireEvent.click(screen.getByText('Delete', { exact: true }))

    expect(vi.mocked(api.updateTask)).toHaveBeenCalledWith(
      'task-recurring',
      expect.objectContaining({ columnId: 'col-done' })
    )
    await waitFor(() => {
      expect(vi.mocked(api.deleteTask)).toHaveBeenCalledWith('task-recurring')
    })
  })

  it('non-recurring task shows inline confirm dialog before delete', async () => {
    const task = { ...mockTask, id: 'task-normal' }
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)

    render(<TaskDrawer mode="edit" task={task} columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /delete task/i }))
    // Confirm in the inline dialog (exact match on "Delete")
    fireEvent.click(screen.getByText('Delete', { exact: true }))

    await waitFor(() => {
      expect(vi.mocked(api.deleteTask)).toHaveBeenCalledWith('task-normal')
    })
  })
})