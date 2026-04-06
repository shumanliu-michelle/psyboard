import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import type { Board, Column, Task, UpdateTaskInput, SystemKey } from '../types.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID, ColumnKind } from '../types.js'
import { reconcileBoard, reconcileTask } from './reconciliation.js'
import { computeNextDate } from './recurrence.js'

const ORDER_GAP_THRESHOLD = 0.001

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const DEFAULT_BOARD_FILE = path.join(DATA_DIR, 'board.json')

// Configurable board path — allows tests to use isolated boards
let _boardFile: string | null = null

export function setBoardPath(filePath: string): void {
  _boardFile = filePath
}

export function resetBoardPath(): void {
  _boardFile = null
}

function getBoardFile(): string {
  if (_boardFile !== null) return _boardFile
  if (process.env.BOARD_PATH) return process.env.BOARD_PATH
  return DEFAULT_BOARD_FILE
}

// Old column format had 'order' instead of 'position'
type LegacyColumn = Omit<Column, 'position' | 'kind' | 'systemKey' | 'createdAt' | 'updatedAt'> & {
  order?: number
  kind?: ColumnKind
  systemKey?: SystemKey
  createdAt?: string
  updatedAt?: string
}

function getTodayString(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  const dir = path.dirname(getBoardFile())
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export function readBoard(): Board {
  ensureDataDir()
  const boardFile = getBoardFile()
  if (!fs.existsSync(boardFile)) {
    writeBoard(DEFAULT_BOARD)
    return DEFAULT_BOARD
  }
  try {
    const raw = fs.readFileSync(boardFile, 'utf-8')
    const board = JSON.parse(raw) as Board
    const healed = migrateAndHeal(board)
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

  const migratedColumns = board.columns.map((col, index) => {
    const legacyCol = col as unknown as LegacyColumn
    if (hasSystemColumns(col)) {
      const sysKey = col.id === BACKLOG_COLUMN_ID ? 'backlog'
        : col.id === TODAY_COLUMN_ID ? 'today' : 'done'
      return {
        ...col,
        kind: 'system' as const,
        systemKey: sysKey as SystemKey,
        position: col.position ?? legacyCol.order ?? 0,
        updatedAt: now,
      }
    } else {
      return {
        ...col,
        kind: 'custom' as const,
        position: col.position ?? legacyCol.order ?? index,
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

  // Reconciliation: promote any date-eligible tasks from Backlog to Today
  const promoted_readBoard = reconcileBoard(healedBoard, getTodayString())
  if (promoted_readBoard.length > 0) {
    console.log(`Reconciled ${promoted_readBoard.length} task(s) to Today`)
  }

  writeBoard(healedBoard)
  return healedBoard
}

export function writeBoard(board: Board): void {
  ensureDataDir()
  // Atomic write: write to temp file, then rename
  const boardFile = getBoardFile()
  const tmp = boardFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(board, null, 2), 'utf-8')
  fs.renameSync(tmp, boardFile)
}

// Column operations
export function createColumn(title: string, accent?: string): Column {
  if (RESERVED_NAMES.includes(title.trim())) {
    throw new Error('Cannot create column with a reserved name')
  }

  const board = readBoard()
  const now = new Date().toISOString()
  const column: Column = {
    id: randomUUID(),
    title: title.trim(),
    kind: 'custom',
    position: board.columns.length,
    accent,
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
  doDate?: string | null,
  dueDate?: string | null,
  priority?: 'low' | 'medium' | 'high',
  assignee?: 'SL' | 'KL',
  recurrence?: { kind: string; mode: string; intervalDays?: number; cronExpr?: string; daysOfWeek?: number[]; dayOfMonth?: number; timezone?: string }
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
    assignee,
    createdAt: now,
    updatedAt: now,
  }
  if (recurrence) {
    task.recurrence = recurrence as Task['recurrence']
  }
  board.tasks.push(task)

  // Reconciliation: promote any date-eligible tasks from Backlog to Today
  const promoted_createTask = reconcileBoard(board, getTodayString())
  if (promoted_createTask.length > 0) {
    console.log(`Reconciled ${promoted_createTask.length} task(s) to Today`)
  }

  writeBoard(board)
  return task
}

export class ConflictError extends Error {
  readonly currentTask: Task
  constructor(currentTask: Task) {
    super(`Task was modified externally`)
    this.name = 'ConflictError'
    this.currentTask = currentTask
  }
}

export function updateTask(id: string, updates: {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high' | null
  completedAt?: string
  recurrence?: { kind: string; mode: string; intervalDays?: number; cronExpr?: string; daysOfWeek?: number[]; dayOfMonth?: number; timezone?: string } | null
  suppressNextOccurrence?: boolean
  expectedUpdatedAt?: string
}): Task {
  const board = readBoard()
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    throw new Error(`Task not found: ${id}`)
  }

  // Optimistic locking: reject if task was modified since the user opened the editor
  if (updates.expectedUpdatedAt !== undefined && task.updatedAt !== updates.expectedUpdatedAt) {
    throw new ConflictError(task)
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
  if (updates.priority !== undefined) task.priority = updates.priority === null ? undefined : updates.priority
  if (updates.completedAt !== undefined) task.completedAt = updates.completedAt
  if (updates.recurrence !== undefined) task.recurrence = updates.recurrence === null ? undefined : updates.recurrence as import('../types.js').RecurrenceConfig
  task.updatedAt = new Date().toISOString()

  // Recurring task completion: generate next occurrence
  const isMovingToDone = updates.columnId === DONE_COLUMN_ID && previousColumnId !== DONE_COLUMN_ID
  const shouldSuppress = updates.suppressNextOccurrence === true

  if (isMovingToDone && task.recurrence && !shouldSuppress) {
    // Idempotency: skip if next occurrence already exists
    const existingNext = board.tasks.find(t => t.previousOccurrenceId === task.id)
    if (!existingNext) {
      // Initialize recurrenceRootId if not set (this task becomes the chain root)
      if (!task.recurrenceRootId) {
        task.recurrenceRootId = task.id
      }

      // Compute next dates
      // completion_based: base is the local date of completion (getTodayString)
      // fixed: base is doDate/dueDate (passed as currentDate in computeNextDate)
      const completionDate = getTodayString()
      const nextDoDate = computeNextDate(
        task.doDate ?? null,
        task.recurrence.kind,
        task.recurrence,
        completionDate
      )
      const nextDueDate = computeNextDate(
        task.dueDate ?? null,
        task.recurrence.kind,
        task.recurrence,
        completionDate
      )

      // Build next occurrence task
      const nextTask: Task = {
        id: randomUUID(),
        title: task.title,
        description: task.description,
        priority: task.priority,
        assignee: task.assignee,
        columnId: BACKLOG_COLUMN_ID,
        order: board.tasks.filter(t => t.columnId === BACKLOG_COLUMN_ID).length,
        doDate: nextDoDate ?? undefined,
        dueDate: nextDueDate ?? undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        recurrence: task.recurrence,
        recurrenceRootId: task.recurrenceRootId,
        previousOccurrenceId: task.id,
      }

      // Check reconciliation — does next task qualify for Today?
      const reconciled = reconcileTask(nextTask, getTodayString())
      if (reconciled) {
        nextTask.columnId = reconciled.columnId
      }

      board.tasks.push(nextTask)
    }
  }

  // Reconciliation: promote any date-eligible tasks from Backlog to Today
  const promoted_updateTask = reconcileBoard(board, getTodayString())
  if (promoted_updateTask.length > 0) {
    console.log(`Reconciled ${promoted_updateTask.length} task(s) to Today`)
  }

  writeBoard(board)
  return task
}

export function deleteTask(id: string): void {
  const board = readBoard()
  board.tasks = board.tasks.filter(t => t.id !== id)
  writeBoard(board)
}

export function reorderTasks(taskId: string, targetColumnId: string, newIndex: number): Task[] {
  const board = readBoard()
  const task = board.tasks.find(t => t.id === taskId)
  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  const sourceColumnId = task.columnId
  const isSameColumn = sourceColumnId === targetColumnId

  // Verify target column exists
  const targetColumn = board.columns.find(c => c.id === targetColumnId)
  if (!targetColumn) {
    throw new Error(`Column not found: ${targetColumnId}`)
  }

  // Helper to get order of task at index, or Infinity/-Infinity for boundaries
  const getTasksInColumn = (columnId: string, excludeTaskId?: string) =>
    board.tasks
      .filter(t => t.columnId === columnId && t.id !== excludeTaskId)
      .sort((a, b) => a.order - b.order)

  const now = new Date().toISOString()

  if (isSameColumn) {
    // Same-column reorder
    const colTasks = getTasksInColumn(sourceColumnId, taskId)
    const prevOrder = newIndex > 0 ? colTasks[Math.min(newIndex - 1, colTasks.length - 1)].order : -Infinity
    const nextOrder = newIndex < colTasks.length ? colTasks[newIndex].order : Infinity
    const midpoint = (prevOrder + nextOrder) / 2

    const needsRenumber = !Number.isFinite(midpoint) ||
      midpoint - prevOrder < ORDER_GAP_THRESHOLD ||
      nextOrder - midpoint < ORDER_GAP_THRESHOLD

    if (needsRenumber) {
      // Renumber all tasks in column
      colTasks.splice(newIndex, 0, task)
      colTasks.forEach((t, i) => {
        t.order = i
        t.updatedAt = now
      })
    } else {
      // Only update the moved task
      task.order = midpoint
      task.updatedAt = now
    }
  } else {
    // Cross-column move
    // Renumber source column (moved task removed)
    const sourceTasks = getTasksInColumn(sourceColumnId, taskId)
    sourceTasks.forEach((t, i) => {
      t.order = i
      t.updatedAt = now
    })

    // Determine midpoint in target column
    const targetTasks = getTasksInColumn(targetColumnId)
    const prevOrder = newIndex > 0 ? targetTasks[newIndex - 1].order : -Infinity
    const nextOrder = newIndex < targetTasks.length ? targetTasks[newIndex].order : Infinity
    const midpoint = (prevOrder + nextOrder) / 2

    const needsRenumber = !Number.isFinite(midpoint) ||
      midpoint - prevOrder < ORDER_GAP_THRESHOLD ||
      nextOrder - midpoint < ORDER_GAP_THRESHOLD

    // Update moved task
    task.columnId = targetColumnId
    task.updatedAt = now

    // Auto-set completedAt when moving into/out of Done
    const previousColumnId = sourceColumnId
    if (targetColumnId === DONE_COLUMN_ID && previousColumnId !== DONE_COLUMN_ID) {
      task.completedAt = now
    }
    if (previousColumnId === DONE_COLUMN_ID && targetColumnId !== DONE_COLUMN_ID) {
      task.completedAt = undefined
    }

    if (needsRenumber) {
      // Insert at newIndex and renumber entire target column
      targetTasks.splice(newIndex, 0, task)
      targetTasks.forEach((t, i) => {
        t.order = i
        t.updatedAt = now
      })
    } else {
      task.order = midpoint
      // Source column already renumbered above
    }
  }

  writeBoard(board)

  // Return affected tasks
  if (isSameColumn) {
    return board.tasks.filter(t => t.columnId === sourceColumnId).sort((a, b) => a.order - b.order)
  }
  return [
    ...board.tasks.filter(t => t.columnId === sourceColumnId).sort((a, b) => a.order - b.order),
    ...board.tasks.filter(t => t.columnId === targetColumnId).sort((a, b) => a.order - b.order),
  ]
}
