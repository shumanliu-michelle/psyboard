import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnCard } from '../components/ColumnCard'
import { FilterProvider } from '../context/FilterContext'
import type { Column, Task } from '../types'
import { DONE_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types'

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
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}))

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}))

// Mock api
vi.mock('../api', () => ({
  api: {
    updateColumn: vi.fn(),
    deleteColumn: vi.fn(),
  },
}))

// Helper to build a minimal column
function makeColumn(overrides: Partial<Column> = {}): Column {
  return {
    id: 'col-1',
    title: 'Test Column',
    kind: 'system',
    systemKey: 'backlog',
    position: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Helper to build a minimal task
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    columnId: 'col-1',
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('ColumnCard', () => {
  const mockOnRefresh = vi.fn()
  const mockOnOpenDrawer = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const renderColumnCard = (column: Column, tasks: Task[] = []) => {
    return render(
      <FilterProvider tasks={tasks}>
        <ColumnCard
          column={column}
          tasks={tasks}
          onRefresh={mockOnRefresh}
          onOpenDrawer={mockOnOpenDrawer}
        />
      </FilterProvider>
    )
  }

  describe('Renders column title', () => {
    it('renders the column title', () => {
      const column = makeColumn({ title: 'My Column' })
      renderColumnCard(column)
      expect(screen.getByText('My Column')).toBeTruthy()
    })
  })

  describe('Shows task count', () => {
    it('shows task count badge with correct number', () => {
      const column = makeColumn({ id: 'col-backlog', title: 'Backlog', systemKey: 'backlog' })
      const tasks = [
        makeTask({ id: 'task-1', columnId: 'col-backlog' }),
        makeTask({ id: 'task-2', columnId: 'col-backlog' }),
        makeTask({ id: 'task-3', columnId: 'col-backlog' }),
      ]
      renderColumnCard(column, tasks)
      // Task count badge shows number
      const taskCount = screen.getByText('3')
      expect(taskCount).toBeTruthy()
    })

    it('shows zero task count for empty column', () => {
      const column = makeColumn({ id: 'col-empty', title: 'Empty Column', systemKey: 'backlog' })
      renderColumnCard(column, [])
      const taskCount = screen.getByText('0')
      expect(taskCount).toBeTruthy()
    })
  })

  describe('System column does NOT show kebab menu', () => {
    it('system column does not render kebab menu button', () => {
      const column = makeColumn({ kind: 'system', systemKey: 'backlog' })
      renderColumnCard(column)
      // System columns don't have a menu button
      expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull()
    })

    it('system column does not show Rename option', () => {
      const column = makeColumn({ kind: 'system', systemKey: 'today' })
      renderColumnCard(column)
      // No menu should appear, so no Rename text in menu
      expect(screen.queryByText('Rename')).toBeNull()
    })
  })

  describe('Custom column shows kebab menu', () => {
    it('custom column shows kebab menu button', async () => {
      const user = userEvent.setup()
      const column = makeColumn({ kind: 'custom', id: 'col-custom-1', title: 'Custom Column' })
      renderColumnCard(column)

      const menuButton = screen.getByRole('button', { name: 'Menu' })
      await user.click(menuButton)

      // Menu should show Rename and Delete options
      expect(screen.getByText('Rename')).toBeTruthy()
      expect(screen.getByText('Delete')).toBeTruthy()
    })
  })

  describe('Delete confirmation for custom column', () => {
    it('shows delete confirmation modal when Delete is clicked', async () => {
      const user = userEvent.setup()
      const column = makeColumn({ kind: 'custom', id: 'col-custom-2', title: 'My Custom Column' })
      renderColumnCard(column)

      // Open menu
      const menuButton = screen.getByRole('button', { name: 'Menu' })
      await user.click(menuButton)

      // Click Delete
      await user.click(screen.getByText('Delete'))

      // Confirmation modal should appear with the delete message
      expect(screen.getByText(/delete column "my custom column"/i)).toBeTruthy()
      expect(screen.getByText('Cancel')).toBeTruthy()
    })

    it('cancels delete when Cancel is clicked', async () => {
      const user = userEvent.setup()
      const column = makeColumn({ kind: 'custom', id: 'col-custom-3', title: 'Column to Cancel' })
      renderColumnCard(column)

      // Open menu and click Delete
      await user.click(screen.getByRole('button', { name: 'Menu' }))
      await user.click(screen.getByText('Delete'))

      // Click Cancel
      await user.click(screen.getByText('Cancel'))

      // Modal should be gone, column title still visible
      expect(screen.queryByText(/delete column/i)).toBeNull()
      expect(screen.getByText('Column to Cancel')).toBeTruthy()
    })
  })

  describe('Done column hides QuickAddForm', () => {
    it('done column does not show QuickAddForm', () => {
      const column = makeColumn({
        id: DONE_COLUMN_ID,
        title: 'Done',
        kind: 'system',
        systemKey: 'done',
      })
      const tasks = [makeTask({ id: 'done-task', columnId: DONE_COLUMN_ID })]
      renderColumnCard(column, tasks)

      // QuickAddForm is not rendered for done column
      // Done column should only show tasks, no add form
      expect(screen.queryByPlaceholderText('Task title')).toBeNull()
    })
  })

  describe('Backlog column shows QuickAddForm', () => {
    it('backlog column shows QuickAddForm', () => {
      const column = makeColumn({
        id: BACKLOG_COLUMN_ID,
        title: 'Backlog',
        kind: 'system',
        systemKey: 'backlog',
      })
      renderColumnCard(column, [])

      // QuickAddForm should be present - it has 'Task title' placeholder
      expect(screen.getByPlaceholderText('Task title')).toBeTruthy()
    })
  })

  describe('Done column pagination', () => {
    it('shows footer when older done tasks exist', () => {
      const today = new Date().toISOString()
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      const tasks = [
        makeTask({ id: 'task-1', columnId: DONE_COLUMN_ID, completedAt: today }),
        makeTask({ id: 'task-2', columnId: DONE_COLUMN_ID, completedAt: eightDaysAgo }),
      ]
      renderColumnCard(column, tasks)

      expect(screen.getByText(/showing last 7 days/i)).toBeTruthy()
      expect(screen.getByText(/1 older task/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Show older tasks' })).toBeTruthy()
    })

    it('does not show footer when all done tasks are within 7 days', () => {
      const today = new Date().toISOString()
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      const tasks = [
        makeTask({ id: 'task-1', columnId: DONE_COLUMN_ID, completedAt: today }),
        makeTask({ id: 'task-2', columnId: DONE_COLUMN_ID, completedAt: today }),
      ]
      renderColumnCard(column, tasks)

      expect(screen.queryByRole('button', { name: /show older tasks/i })).toBeNull()
    })

    it('shows empty state when done column has no tasks', () => {
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      renderColumnCard(column, [])

      expect(screen.getByText('No completed tasks yet')).toBeTruthy()
    })
  })
})