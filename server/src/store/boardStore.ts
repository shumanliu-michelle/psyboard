import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import type { Board, Column, Task, UpdateTaskInput } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'data')
const BOARD_FILE = path.join(DATA_DIR, 'board.json')

const DEFAULT_COLUMNS: Column[] = [
  { id: randomUUID(), title: 'Todo', order: 0 },
  { id: randomUUID(), title: 'Today', order: 1 },
  { id: randomUUID(), title: 'This Week', order: 2 },
  { id: randomUUID(), title: 'Done', order: 3 },
]

const DEFAULT_BOARD: Board = {
  columns: DEFAULT_COLUMNS,
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
    // First run — create default board
    writeBoard(DEFAULT_BOARD)
    return DEFAULT_BOARD
  }
  try {
    const raw = fs.readFileSync(BOARD_FILE, 'utf-8')
    return JSON.parse(raw) as Board
  } catch {
    // Corrupted — recreate from default
    const board = DEFAULT_BOARD
    writeBoard(board)
    return board
  }
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
  const column: Column = {
    id: randomUUID(),
    title,
    order: board.columns.length,
  }
  board.columns.push(column)
  writeBoard(board)
  return column
}

export function deleteColumn(id: string): void {
  const board = readBoard()
  board.columns = board.columns.filter(c => c.id !== id)
  // Also delete all tasks in this column
  board.tasks = board.tasks.filter(t => t.columnId !== id)
  writeBoard(board)
}

// Task operations
export function createTask(title: string, columnId: string, description?: string): Task {
  const board = readBoard()
  const tasksInColumn = board.tasks.filter(t => t.columnId === columnId)
  const now = new Date().toISOString()
  const task: Task = {
    id: randomUUID(),
    title,
    description,
    columnId,
    order: tasksInColumn.length,
    createdAt: now,
    updatedAt: now,
  }
  board.tasks.push(task)
  writeBoard(board)
  return task
}

export function updateTask(id: string, updates: UpdateTaskInput): Task {
  const board = readBoard()
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    throw new Error(`Task not found: ${id}`)
  }
  // If moving to a different column, reorder
  if (updates.columnId && updates.columnId !== task.columnId) {
    task.columnId = updates.columnId
    task.order = board.tasks.filter(t => t.columnId === updates.columnId).length
  }
  if (updates.title !== undefined) task.title = updates.title
  if (updates.description !== undefined) task.description = updates.description
  if (updates.order !== undefined) task.order = updates.order
  if (updates.assignee !== undefined) task.assignee = updates.assignee === null ? undefined : updates.assignee
  task.updatedAt = new Date().toISOString()
  writeBoard(board)
  return task
}

export function deleteTask(id: string): void {
  const board = readBoard()
  board.tasks = board.tasks.filter(t => t.id !== id)
  writeBoard(board)
}
