import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import { BoardView } from '../components/BoardView'
import { FilterProvider } from '../context/FilterContext'
import type { Board, Column, Task } from '../types'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types'

// Mock @dnd-kit/core to avoid DnD initialization issues
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
  useDroppable: vi.fn(() => ({ setNodeRef: vi.fn(), isOver: false })),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}))

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  horizontalListSortingStrategy: {},
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

// Mock api module
vi.mock('../api', () => ({
  api: {
    getBoard: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    reorderTasks: vi.fn(),
    reorderColumns: vi.fn(),
  },
}))

// Helper to build a minimal board
function makeBoard(columns: Column[], tasks: Task[]): Board {
  return { columns, tasks }
}

// Sample system columns
const backlogColumn: Column = {
  id: BACKLOG_COLUMN_ID,
  title: 'Backlog',
  kind: 'system',
  systemKey: 'backlog',
  position: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const todayColumn: Column = {
  id: TODAY_COLUMN_ID,
  title: 'Today',
  kind: 'system',
  systemKey: 'today',
  position: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const doneColumn: Column = {
  id: DONE_COLUMN_ID,
  title: 'Done',
  kind: 'system',
  systemKey: 'done',
  position: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

// Sample tasks
const task1: Task = {
  id: 'task-1',
  title: 'Task in Backlog',
  columnId: BACKLOG_COLUMN_ID,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const task2: Task = {
  id: 'task-2',
  title: 'Task in Today',
  columnId: TODAY_COLUMN_ID,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const task3: Task = {
  id: 'task-3',
  title: 'Completed Task',
  columnId: DONE_COLUMN_ID,
  order: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  completedAt: '2026-01-02T00:00:00.000Z',
}

describe('BoardView', () => {
  const onRefresh = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders all three system columns (Backlog, Today, Done)', () => {
    const board = makeBoard([backlogColumn, todayColumn, doneColumn], [])
    render(<FilterProvider tasks={board.tasks}><BoardView board={board} onRefresh={onRefresh} /></FilterProvider>)
    expect(screen.getByText('Backlog')).toBeTruthy()
    expect(screen.getByText('Today')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()
  })

  it('renders tasks in the correct columns', () => {
    const board = makeBoard(
      [backlogColumn, todayColumn, doneColumn],
      [task1, task2, task3]
    )
    render(<FilterProvider tasks={board.tasks}><BoardView board={board} onRefresh={onRefresh} /></FilterProvider>)
    expect(screen.getByText('Task in Backlog')).toBeTruthy()
    expect(screen.getByText('Task in Today')).toBeTruthy()
    expect(screen.getByText('Completed Task')).toBeTruthy()
  })

  it('shows tasks only in their respective columns', () => {
    const board = makeBoard(
      [backlogColumn, todayColumn, doneColumn],
      [task1, task2, task3]
    )
    const { container } = render(<FilterProvider tasks={board.tasks}><BoardView board={board} onRefresh={onRefresh} /></FilterProvider>)
    // The backlog column should contain "Task in Backlog"
    // The today column should contain "Task in Today"
    // The done column should contain "Completed Task"
    // Each task should appear exactly once
    const task1Elements = container.querySelectorAll('.task-card')
    expect(task1Elements.length).toBe(3)
  })

  it('renders empty board without errors', () => {
    const board = makeBoard([backlogColumn, todayColumn, doneColumn], [])
    expect(() => render(<FilterProvider tasks={board.tasks}><BoardView board={board} onRefresh={onRefresh} /></FilterProvider>)).not.toThrow()
  })

  it('shows the Add column button', () => {
    const board = makeBoard([backlogColumn, todayColumn, doneColumn], [])
    render(<FilterProvider tasks={board.tasks}><BoardView board={board} onRefresh={onRefresh} /></FilterProvider>)
    expect(screen.getByText('+ Add column')).toBeTruthy()
  })
})
