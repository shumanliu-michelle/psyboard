import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import type { Board, Column, Task, UpdateTaskInput, SystemKey } from '../types.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID, ColumnKind } from '../types.js'
import { reconcileBoard } from './reconciliation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const BOARD_FILE = path.join(DATA_DIR, 'board.json')

function getTodayString(): string {
  return new Date().toISOString().split('T')[0] // YYYY-MM-DD
}

const SYSTEM_COLUMNS: Column[] = [
  { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system' as ColumnKind, systemKey: 'backlog' as SystemKey, position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system' as ColumnKind, systemKey: 'today' as SystemKey, position: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: DONE_COLUMN_ID, title: 'Done', kind: 'system' as ColumnKind, systemKey: 'done' as SystemKey, position: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

const DEFAULT_BOARD: Board = {
  columns: [...SYSTEM_COLUMNS],
  tasks: [],
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function readBoard(): Board {
  ensureDataDir()
  if (!fs.existsSync(BOARD_FILE)) {
    writeBoard(DEFAULT_BOARD)
    return DEFAULT_BOARD
  }
  try {
    const raw = fs.readFileSync(BOARD_FILE, 'utf-8')
    const board = JSON.parse(raw) as Board
    const healed = migrateAndHeal(board)
    // Reconciliation: promote any date-eligible tasks from Backlog to Today
    reconcileBoard(healed, getTodayString())
    return healed
  } catch {
    const board = DEFAULT_BOARD
    writeBoard(board)
    return board
  }
}

function migrateAndHeal(board: Board): Board {
  const now = new Date().toISOString()
  const hasSystemColumns = (col: Column) =>
    col.id === BACKLOG_COLUMN_ID || col.id === TODAY_COLUMN_ID || col.id === DONE_COLUMN_ID

  const existingSystem = board.columns.filter(c => hasSystemColumns(c))
  const missingSystem: Column[] = []

  for (const sys of SYSTEM_COLUMNS) {
    if (!board.columns.find(c => c.id === sys.id)) {
      missingSystem.push({ ...sys, createdAt: now, updatedAt: now })
    }
  }

  const migratedColumns = board.columns.map(col => {
    if (hasSystemColumns(col)) {
      const sysKey = col.id === BACKLOG_COLUMN_ID ? 'backlog'
        : col.id === TODAY_COLUMN_ID ? 'today' : 'done'
      return {
        ...col,
        kind: 'system' as const,
        systemKey: sysKey as SystemKey,
        position: col.position ?? (col as any).order ?? 0,
        updatedAt: now,
      }
    } else {
      return {
        ...col,
        kind: 'custom' as const,
        position: col.position ?? (col as any).order ?? board.columns.indexOf(col),
        updatedAt: now,
      }
    }
  })

  const allColumns = [...migratedColumns, ...missingSystem]

  const healedBoard: Board = {
    ...board,
    columns: allColumns,
    tasks: board.tasks ?? [],
  }
  writeBoard(healedBoard)
  return healedBoard
}

export function writeBoard(board: Board): void {
  ensureDataDir()
  // Atomic write: write to temp file, then rename
  const tmp = BOARD_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), 'utf-8')
  fs.renameSync(tmp, BOARD_FILE)
}

// Column operations
export function createColumn(title: string): Column {
  const board = readBoard()
  const now = new Date().toISOString()
  const column: Column = {
    id: randomUUID(),
    title,
    kind: 'custom',
    position: board.columns.length,
    createdAt: now,
    updatedAt: now,
  }
  board.columns.push(column)
  writeBoard(board)
  return column
}

export function deleteColumn(id: string): void {
  const board = readBoard()
  const column = board.columns.find(c => c.id === id)

  if (!column) {
    throw new Error('Column not found')
  }
  if (column.kind === 'system') {
    throw new Error('Cannot delete system column')
  }

  // Move tasks to Backlog
  board.tasks = board.tasks.map(t =>
    t.columnId === id ? { ...t, columnId: BACKLOG_COLUMN_ID } : t
  )

  board.columns = board.columns.filter(c => c.id !== id)
  writeBoard(board)
}

const RESERVED_NAMES = ['Backlog', 'Today', 'Done']

export function updateColumn(id: string, updates: { title?: string; position?: number }): Column {
  const board = readBoard()
  const column = board.columns.find(c => c.id === id)

  if (!column) {
    throw new Error('Column not found')
  }
  if (column.kind === 'system') {
    throw new Error('Cannot update a system column')
  }

  if (updates.title !== undefined) {
    if (RESERVED_NAMES.includes(updates.title.trim())) {
      throw new Error('Cannot rename column to a reserved name')
    }
    column.title = updates.title.trim()
  }

  if (updates.position !== undefined) {
    const oldPos = column.position
    const newPos = updates.position

    board.columns.forEach(c => {
      if (c.id === id) {
        c.position = newPos
      } else if (oldPos < newPos) {
        if (c.position > oldPos && c.position <= newPos) {
          c.position = c.position - 1
        }
      } else if (oldPos > newPos) {
        if (c.position >= newPos && c.position < oldPos) {
          c.position = c.position + 1
        }
      }
    })
  }

  column.updatedAt = new Date().toISOString()
  writeBoard(board)
  return column
}

export function reorderColumns(columnIds: string[]): Column[] {
  const board = readBoard()

  columnIds.forEach((id, index) => {
    const col = board.columns.find(c => c.id === id)
    if (col) {
      col.position = index
      col.updatedAt = new Date().toISOString()
    }
  })

  writeBoard(board)
  return board.columns.slice().sort((a, b) => a.position - b.position)
}

// Task operations
export function createTask(
  title: string,
  columnId: string,
  description?: string,
  doDate?: string,
  dueDate?: string,
  priority?: 'low' | 'medium' | 'high'
): Task {
  const board = readBoard()
  const tasksInColumn = board.tasks.filter(t => t.columnId === columnId)
  const now = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    title,
    description,
    columnId,
    order: tasksInColumn.length,
    doDate,
    dueDate,
    priority,
    createdAt: now,
    updatedAt: now,
  }
  board.tasks.push(task)
  writeBoard(board)

  // Reconciliation: promote any date-eligible tasks from Backlog to Today
  reconcileBoard(board, getTodayString())

  return task
}

export function updateTask(id: string, updates: {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string
  dueDate?: string
  priority?: 'low' | 'medium' | 'high'
  completedAt?: string
  manualOrder?: number
}): Task {
  const board = readBoard()
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    throw new Error(`Task not found: ${id}`)
  }

  const previousColumnId = task.columnId

  // Handle columnId change
  if (updates.columnId !== undefined && updates.columnId !== task.columnId) {
    task.columnId = updates.columnId
    task.order = board.tasks.filter(t => t.columnId === updates.columnId).length
  }

  // Auto-set completedAt when moving to Done
  if (task.columnId === DONE_COLUMN_ID && previousColumnId !== DONE_COLUMN_ID) {
    task.completedAt = new Date().toISOString()
  }

  // Auto-clear completedAt when moving out of Done
  if (previousColumnId === DONE_COLUMN_ID && task.columnId !== DONE_COLUMN_ID) {
    task.completedAt = undefined
  }

  if (updates.title !== undefined) task.title = updates.title
  if (updates.description !== undefined) task.description = updates.description
  if (updates.order !== undefined) task.order = updates.order
  if (updates.assignee !== undefined) task.assignee = updates.assignee === null ? undefined : updates.assignee
  if (updates.doDate !== undefined) task.doDate = updates.doDate
  if (updates.dueDate !== undefined) task.dueDate = updates.dueDate
  if (updates.priority !== undefined) task.priority = updates.priority
  if (updates.completedAt !== undefined) task.completedAt = updates.completedAt
  if (updates.manualOrder !== undefined) task.manualOrder = updates.manualOrder
  task.updatedAt = new Date().toISOString()

  writeBoard(board)

  // Reconciliation: promote any date-eligible tasks from Backlog to Today
  reconcileBoard(board, getTodayString())

  return task
}

export function deleteTask(id: string): void {
  const board = readBoard()
  board.tasks = board.tasks.filter(t => t.id !== id)
  writeBoard(board)
}
