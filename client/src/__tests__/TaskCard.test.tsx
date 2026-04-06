import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskCard } from '../components/TaskCard'
import { FilterProvider } from '../context/FilterContext'
import type { Task } from '../types'
import { DONE_COLUMN_ID } from '../types'

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}))

// Mock api module
vi.mock('../api', () => ({
  api: {
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
  },
}))

// Helper to build a minimal task
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    columnId: 'col-todo',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('TaskCard', () => {
  const mockOnUpdated = vi.fn()
  const mockOnDeleted = vi.fn()
  const mockOnOpenEdit = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderTaskCard = (task: Task) => {
    return render(
      <FilterProvider tasks={[task]}>
        <TaskCard
          task={task}
          onUpdated={mockOnUpdated}
          onDeleted={mockOnDeleted}
          onOpenEdit={mockOnOpenEdit}
        />
      </FilterProvider>
    )
  }

  describe('Rendering', () => {
    it('renders task title', () => {
      const task = makeTask({ title: 'My Task Title' })
      renderTaskCard(task)
      expect(screen.getByText('My Task Title')).toBeTruthy()
    })
  })

  describe('Overdue styling', () => {
    it('shows overdue styling when dueDate < today AND columnId !== DONE_COLUMN_ID', () => {
      // Today's date in the test environment is 2026-04-06 (from MEMORY.md)
      // Use a date in the past to trigger overdue
      const task = makeTask({
        id: 'overdue-task',
        title: 'Overdue Task',
        columnId: 'col-todo', // NOT Done column
        dueDate: '2026-04-01', // Before today (2026-04-06)
      })
      renderTaskCard(task)

      // The card should have red background for overdue
      const card = screen.getByText('Overdue Task').closest('.task-card')
      expect(card).toHaveStyle({ background: '#fee2e2' })
    })

    it('does NOT show overdue styling for task in Done', () => {
      const task = makeTask({
        id: 'done-overdue-task',
        title: 'Done Task',
        columnId: DONE_COLUMN_ID,
        dueDate: '2026-04-01', // Before today but in Done column
      })
      renderTaskCard(task)

      // The card should NOT have the overdue red background
      const card = screen.getByText('Done Task').closest('.task-card')
      expect(card).not.toHaveStyle({ background: '#fee2e2' })
    })
  })

  describe('Assignee badge', () => {
    it('shows SL assignee badge with pink color', () => {
      const task = makeTask({
        id: 'sl-task',
        title: 'SL Assigned Task',
        assignee: 'SL',
      })
      renderTaskCard(task)

      const badge = screen.getByText('SL')
      expect(badge).toBeTruthy()
      // Pink background and text (on the span itself)
      expect(badge).toHaveStyle({ background: '#fdf2f8', color: '#ec4899' })
    })

    it('shows KL assignee badge with blue color', () => {
      const task = makeTask({
        id: 'kl-task',
        title: 'KL Assigned Task',
        assignee: 'KL',
      })
      renderTaskCard(task)

      const badge = screen.getByText('KL')
      expect(badge).toBeTruthy()
      // Blue background and text (on the span itself)
      expect(badge).toHaveStyle({ background: '#dbeafe', color: '#1e40af' })
    })

    it('shows no assignee badge when assignee is undefined', () => {
      const task = makeTask({
        id: 'unassigned-task',
        title: 'Unassigned Task',
        assignee: undefined,
      })
      renderTaskCard(task)

      // Should not find SL or KL text
      expect(screen.queryByText('SL')).toBeNull()
      expect(screen.queryByText('KL')).toBeNull()
    })
  })

  describe('Kebab menu', () => {
    it('opens kebab menu on kebab button click', async () => {
      const user = userEvent.setup()
      const task = makeTask({ id: 'menu-task', title: 'Task with Menu' })
      renderTaskCard(task)

      // Click the menu button (aria-label="Menu") - be specific to find only the kebab button
      const menuButton = screen.getByRole('button', { name: 'Menu' })
      await user.click(menuButton)

      // Menu should now show Assign option
      expect(screen.getByText('Assign')).toBeTruthy()
      expect(screen.getByText('Priority')).toBeTruthy()
      expect(screen.getByText('Edit')).toBeTruthy()
      expect(screen.getByText('Delete')).toBeTruthy()
    })

    it('calls onOpenEdit on Edit menu click', async () => {
      const user = userEvent.setup()
      const task = makeTask({ id: 'edit-task', title: 'Task to Edit' })
      renderTaskCard(task)

      // Open menu
      const menuButton = screen.getByRole('button', { name: 'Menu' })
      await user.click(menuButton)

      // Click Edit
      await user.click(screen.getByText('Edit'))

      expect(mockOnOpenEdit).toHaveBeenCalledTimes(1)
    })

    it('shows confirmation on Delete menu click', async () => {
      const user = userEvent.setup()
      const task = makeTask({ id: 'delete-task', title: 'Task to Delete' })
      renderTaskCard(task)

      // Open menu
      const menuButton = screen.getByRole('button', { name: 'Menu' })
      await user.click(menuButton)

      // Click Delete
      await user.click(screen.getByText('Delete'))

      // Should show confirmation dialog with task title
      expect(screen.getByText(/delete "task to delete"/i)).toBeTruthy()
      expect(screen.getByText('Cancel')).toBeTruthy()
      expect(screen.getByText('Delete')).toBeTruthy()
    })
  })

  describe('Priority border color', () => {
    it('shows red border for high priority', () => {
      const task = makeTask({
        id: 'high-priority-task',
        title: 'High Priority Task',
        priority: 'high',
      })
      renderTaskCard(task)

      const card = screen.getByText('High Priority Task').closest('.task-card')
      expect(card).toHaveStyle({ borderLeft: '3px solid #ef4444' })
    })

    it('shows amber border for medium priority', () => {
      const task = makeTask({
        id: 'medium-priority-task',
        title: 'Medium Priority Task',
        priority: 'medium',
      })
      renderTaskCard(task)

      const card = screen.getByText('Medium Priority Task').closest('.task-card')
      expect(card).toHaveStyle({ borderLeft: '3px solid #f59e0b' })
    })

    it('shows green border for low priority', () => {
      const task = makeTask({
        id: 'low-priority-task',
        title: 'Low Priority Task',
        priority: 'low',
      })
      renderTaskCard(task)

      const card = screen.getByText('Low Priority Task').closest('.task-card')
      expect(card).toHaveStyle({ borderLeft: '3px solid #22c55e' })
    })
  })
})
