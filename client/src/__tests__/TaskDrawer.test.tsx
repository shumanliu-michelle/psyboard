import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('TaskDrawer — create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with title input and all fields', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={() => {}} onSaved={() => {}} />)
    expect(screen.getByPlaceholderText('Task title')).toBeTruthy()
    expect(screen.getByText('Notes')).toBeTruthy()
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

  it('does NOT close after save (drawer stays open)', async () => {
    vi.mocked(api.createTask).mockResolvedValue({ id: 'new-1' } as Task)
    const onClose = vi.fn()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'New task' } })
    fireEvent.click(screen.getByText('Save'))
    await new Promise(r => setTimeout(r, 0))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes when Escape key is pressed', () => {
    const onClose = vi.fn()
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={onClose} onSaved={() => {}} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDrawer — edit mode', () => {
  const mockTask: Task = {
    id: 't1', title: 'Existing task', columnId: 'col-backlog', order: 0,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }

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
})