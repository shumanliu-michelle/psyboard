# Epic 2: Task Model & Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Task data model with doDate, dueDate, priority, notes, manualOrder, and completedAt. Implement column-aware sorting and a backend reconciliation engine that promotes date-eligible tasks into Today.

**Architecture:** A pure `reconcileBoard()` function in `server/src/store/reconciliation.ts` that evaluates all Backlog tasks and promotes those with doDate/dueDate eligible for Today. Reconciliation runs after `readBoard()`, `createTask()`, and `updateTask()`. The `completedAt` field is set/cleared automatically when tasks enter/leave Done. Frontend types sync to match backend types. Sorting in `BoardView` changes to use correct fields per column kind.

**Tech Stack:** Express + TypeScript (server), React + TypeScript (client), Vitest (tests)

---

## File Map

| File | Role |
|------|------|
| `server/src/types.ts` | Add new Task fields, update input types |
| `client/src/types.ts` | Sync new Task fields to frontend |
| `server/src/store/reconciliation.ts` | **New file** — pure reconciliation function |
| `server/src/store/boardStore.ts` | Call `reconcileBoard()` after mutations; update `createTask`/`updateTask` signatures |
| `server/src/routes/tasks.ts` | Handle `completedAt` auto-set/clear; validate date constraints |
| `client/src/components/BoardView.tsx` | Column-aware task sorting |
| `client/src/api.ts` | Sync `UpdateTaskInput` type |
| `server/src/__tests__/reconciliation.test.ts` | **New file** — vitest tests for reconciliation logic |

---

## Task 1: Update Server Types

**Files:**
- Modify: `server/src/types.ts:1-47`

- [ ] **Step 1: Add new types**

Replace the `Task` type and add new input types. The file should end up with:

```ts
// After the existing type exports, add:

export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number

  doDate?: string      // YYYY-MM-DD — when user plans to work on it
  dueDate?: string     // YYYY-MM-DD — deadline
  priority?: TaskPriority
  assignee?: 'SL' | 'KL'

  manualOrder?: number  // for manual ordering in Today and custom columns

  createdAt: string
  updatedAt: string
  completedAt?: string // ISO datetime — set when moved to Done, cleared when moved out
}

export type CreateTaskInput = {
  title: string
  columnId: string
  description?: string
  doDate?: string
  dueDate?: string
  priority?: TaskPriority
}

export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string
  dueDate?: string
  priority?: TaskPriority
  completedAt?: string
  manualOrder?: number
}
```

Note: Keep `Column`, `ColumnKind`, `SystemKey`, `BACKLOG_COLUMN_ID`, `TODAY_COLUMN_ID`, `DONE_COLUMN_ID`, `Board`, `CreateColumnInput` exactly as they are — only add the new Task-related types below them.

- [ ] **Step 2: Verify file compiles**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/types.ts
git commit -m "epic2: add TaskPriority type and extend Task model fields"
```

---

## Task 2: Create Reconciliation Logic

**Files:**
- Create: `server/src/store/reconciliation.ts`
- Modify: `server/src/store/boardStore.ts:1-239`

- [ ] **Step 1: Write the failing test**

Create `server/src/__tests__` directory if it doesn't exist. Create `server/src/__tests__/reconciliation.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { Board, Task } from '../types.js'
import { reconcileBoard } from '../store/reconciliation.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'

const today = '2026-04-05'

function makeBoard(tasks: Partial<Task>[]): Board {
  return {
    columns: [
      { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
      { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
      { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
    ],
    tasks: tasks.map((t, i) => ({
      id: t.id ?? `task-${i}`,
      title: t.title ?? 'Test task',
      columnId: t.columnId ?? BACKLOG_COLUMN_ID,
      order: i,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...t,
    })),
  }
}

describe('reconcileBoard', () => {
  it('does not promote task with doDate in the future', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('promotes task with doDate <= today from Backlog', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-05', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('promotes task with doDate < today from Backlog', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('promotes task with dueDate <= today when doDate is absent', () => {
    const board = makeBoard([{ id: 't1', dueDate: '2026-04-05', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('does not promote task with dueDate > today and no doDate', () => {
    const board = makeBoard([{ id: 't1', dueDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task already in Today', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: TODAY_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task already in Done', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: DONE_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task with no dates in Backlog', () => {
    const board = makeBoard([{ id: 't1', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('prefers doDate over dueDate when both are present and doDate is eligible', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', dueDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx vitest run src/__tests__/reconciliation.test.ts`
Expected: FAIL — reconcileBoard not found

- [ ] **Step 3: Write the implementation**

Create `server/src/store/reconciliation.ts`:

```ts
import type { Board, Task } from '../types.js'
import { TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'

/**
 * Checks if a single task should be promoted to Today.
 * Returns the promoted task (with updated columnId) or null if not eligible.
 */
export function reconcileTask(task: Task, today: string): Task | null {
  // Already in Today or Done — skip
  if (task.columnId === TODAY_COLUMN_ID || task.columnId === DONE_COLUMN_ID) {
    return null
  }

  // Today promotion rule
  const doDateOk = task.doDate !== undefined && task.doDate <= today
  const dueDateFallback =
    task.doDate === undefined &&
    task.dueDate !== undefined &&
    task.dueDate <= today

  if (doDateOk || dueDateFallback) {
    return { ...task, columnId: TODAY_COLUMN_ID }
  }

  return null
}

/**
 * Reconciles all tasks in the board.
 * Returns the promoted task or null if none were promoted.
 * Does NOT persist — caller is responsible for writing the board.
 */
export function reconcileBoard(board: Board, today: string): Task | null {
  for (const task of board.tasks) {
    const promoted = reconcileTask(task, today)
    if (promoted) {
      return promoted
    }
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx vitest run src/__tests__/reconciliation.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/reconciliation.ts server/src/__tests__/reconciliation.test.ts
git commit -m "epic2: add reconciliation engine for date-based task promotion"
```

---

## Task 3: Integrate Reconciliation into boardStore

**Files:**
- Modify: `server/src/store/boardStore.ts:196-233`

- [ ] **Step 1: Add import and today helper at top of boardStore.ts**

After the existing imports (line 6), add:

```ts
import { reconcileBoard } from './reconciliation.js'
```

Add a helper function after the DATA_DIR declaration (around line 9):

```ts
function getTodayString(): string {
  return new Date().toISOString().split('T')[0] // YYYY-MM-DD
}
```

- [ ] **Step 2: Update createTask to support new fields and call reconcileBoard**

Replace the existing `createTask` function (starting at line 197) with:

```ts
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
```

- [ ] **Step 3: Update updateTask to support new fields, handle completedAt auto-set/clear, and call reconcileBoard**

Replace the existing `updateTask` function (starting at line 215) with:

```ts
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
```

- [ ] **Step 4: Update readBoard to call reconcileBoard after migrateAndHeal**

In the `readBoard()` function, after `return migrateAndHeal(board)` on line 38, modify the function to call reconcileBoard:

Replace the `readBoard` function (lines 29-44) with:

```ts
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
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/boardStore.ts
git commit -m "epic2: integrate reconciliation into createTask, updateTask, and readBoard"
```

---

## Task 4: Update Task API Routes

**Files:**
- Modify: `server/src/routes/tasks.ts:1-83`

- [ ] **Step 1: Update POST /tasks handler to accept new fields and validate dates**

Replace the `router.post` handler (lines 6-33) with:

```ts
router.post('/', (req, res) => {
  const { title, columnId, description, doDate, dueDate, priority } = req.body as {
    title?: string
    columnId?: string
    description?: string
    doDate?: string
    dueDate?: string
    priority?: 'low' | 'medium' | 'high'
  }

  // Validate
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Task title is required and must be non-empty' })
    return
  }
  if (!columnId || typeof columnId !== 'string') {
    res.status(400).json({ error: 'columnId is required' })
    return
  }

  // Validate doDate/dueDate if both present
  if (doDate && dueDate && doDate.length > 0 && dueDate.length > 0) {
    if (dueDate < doDate) {
      res.status(400).json({ error: 'dueDate must be on or after doDate' })
      return
    }
  }

  // Validate priority
  if (priority !== undefined && !['low', 'medium', 'high'].includes(priority)) {
    res.status(400).json({ error: 'priority must be low, medium, or high' })
    return
  }

  // Verify column exists
  const board = readBoard()
  const column = board.columns.find(c => c.id === columnId)
  if (!column) {
    res.status(400).json({ error: 'Column not found' })
    return
  }

  try {
    const task = createTask(
      title.trim(),
      columnId,
      description?.trim(),
      doDate?.trim() || undefined,
      dueDate?.trim() || undefined,
      priority
    )
    res.status(201).json(task)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' })
  }
})
```

- [ ] **Step 2: Update PATCH /tasks/:id handler to accept new fields**

Replace the `router.patch` handler (lines 35-64) with:

```ts
router.patch('/:id', (req, res) => {
  const { id } = req.params
  const updates = req.body as {
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
  }

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid task ID' })
    return
  }

  // Validate doDate/dueDate if both present
  if (updates.doDate && updates.dueDate && updates.doDate.length > 0 && updates.dueDate.length > 0) {
    if (updates.dueDate < updates.doDate) {
      res.status(400).json({ error: 'dueDate must be on or after doDate' })
      return
    }
  }

  // Validate priority
  if (updates.priority !== undefined && !['low', 'medium', 'high'].includes(updates.priority)) {
    res.status(400).json({ error: 'priority must be low, medium, or high' })
    return
  }

  // If changing columnId, verify it exists
  if (updates.columnId) {
    const board = readBoard()
    const column = board.columns.find(c => c.id === updates.columnId)
    if (!column) {
      res.status(400).json({ error: 'Column not found' })
      return
    }
  }

  try {
    const task = updateTask(id, updates)
    res.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.status(500).json({ error: 'Failed to update task' })
  }
})
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/routes/tasks.ts
git commit -m "epic2: update task routes to accept new fields and validate dates"
```

---

## Task 5: Sync Client Types and Update BoardView Sorting

**Files:**
- Modify: `client/src/types.ts:1-47`
- Modify: `client/src/api.ts:1-38`
- Modify: `client/src/components/BoardView.tsx:1-108`

- [ ] **Step 1: Update client types.ts to match server types**

Replace the `Task` type and add new input types in `client/src/types.ts`. Keep everything else the same:

```ts
export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number

  doDate?: string
  dueDate?: string
  priority?: TaskPriority
  assignee?: 'SL' | 'KL'

  manualOrder?: number

  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type CreateTaskInput = {
  title: string
  columnId: string
  description?: string
  doDate?: string
  dueDate?: string
  priority?: TaskPriority
}

export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string
  dueDate?: string
  priority?: TaskPriority
  completedAt?: string
  manualOrder?: number
}
```

- [ ] **Step 2: Update client api.ts CreateTaskInput and UpdateTaskInput**

In `client/src/api.ts`, update the `createTask` and `updateTask` calls to use the new types. The API already uses the types — no changes needed since the types now include the new fields.

- [ ] **Step 3: Update BoardView.tsx sorting logic**

The spec says:
- `col-backlog` → sort by doDate/dueDate/createdAt
- `col-today` → sort by manualOrder
- `col-done` → sort by completedAt descending
- Custom columns → sort by manualOrder

Replace the task sorting in `BoardView.tsx` (lines 72-74). The current code is:

```ts
const columnTasks = board.tasks
  .filter(t => t.columnId === column.id)
  .sort((a, b) => a.order - b.order)
```

Replace with a sorting function. Add this helper above the component or as a module-level function outside `BoardView`:

```ts
function sortTasksForColumn(tasks: Task[], columnId: string, columnKind: 'system' | 'custom', systemKey?: string): Task[] {
  if (systemKey === 'backlog') {
    return [...tasks].sort((a, b) => {
      // 1. doDate ascending (earliest first)
      if (a.doDate && b.doDate) {
        if (a.doDate !== b.doDate) return a.doDate.localeCompare(b.doDate)
      } else if (a.doDate) return -1
      else if (b.doDate) return 1
      // 2. dueDate ascending as fallback
      if (a.dueDate && b.dueDate) {
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      } else if (a.dueDate) return -1
      else if (b.dueDate) return 1
      // 3. Neither date — by createdAt
      return a.createdAt.localeCompare(b.createdAt)
    })
  }
  if (systemKey === 'done') {
    return [...tasks].sort((a, b) => {
      if (!a.completedAt && !b.completedAt) return 0
      if (!a.completedAt) return 1
      if (!b.completedAt) return -1
      return b.completedAt.localeCompare(a.completedAt) // descending (most recent first)
    })
  }
  // Today and custom columns — sort by manualOrder, then order as fallback
  return [...tasks].sort((a, b) => {
    if (a.manualOrder !== undefined && b.manualOrder !== undefined) {
      return a.manualOrder - b.manualOrder
    } else if (a.manualOrder !== undefined) return -1
    else if (b.manualOrder !== undefined) return 1
    return a.order - b.order
  })
}
```

Then replace the sorting in the component:

```ts
const columnTasks = sortTasksForColumn(
  board.tasks.filter(t => t.columnId === column.id),
  column.id,
  column.kind,
  column.systemKey
)
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/types.ts client/src/components/BoardView.tsx
git commit -m "epic2: sync client types and implement column-aware task sorting"
```

---

## Task 6: Add completedAt Tests for updateTask

**Files:**
- Create: `server/src/__tests__/tasks.test.ts`

- [ ] **Step 1: Write tests for completedAt auto-set/clear behavior**

Create `server/src/__tests__/tasks.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { DONE_COLUMN_ID, TODAY_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types.js'
import { writeBoard, readBoard } from '../store/boardStore.js'
import type { Board } from '../types.js'

function makeTask(title: string, columnId: string, extra = {}) {
  const { randomUUID } = require('crypto')
  return {
    id: randomUUID(),
    title,
    columnId,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra,
  }
}

describe('PATCH /api/tasks/:id — completedAt behavior', () => {
  beforeEach(() => {
    const board: Board = {
      columns: [
        { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
        { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
        { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
      ],
      tasks: [],
    }
    writeBoard(board)
  })

  async function createTask(title: string, columnId: string) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title, columnId })
    return res.body
  }

  it('sets completedAt when moving a task to Done', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()
    expect(new Date(res.body.completedAt)).toBeInstanceOf(Date)
  })

  it('clears completedAt when moving a task out of Done', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    // Move to Done
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    // Move back to Today
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: TODAY_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeUndefined()
  })

  it('keeps completedAt when updating a task already in Done without changing column', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    const completedAt = (await request(app).patch(`/api/tasks/${task.id}`).send({ title: 'New title' })).body.completedAt
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ title: 'Updated again' })
    expect(res.body.completedAt).toBe(completedAt)
  })
})

describe('POST /api/tasks — date validation', () => {
  beforeEach(() => {
    const board: Board = {
      columns: [
        { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
        { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
        { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
      ],
      tasks: [],
    }
    writeBoard(board)
  })

  it('returns 400 when dueDate is before doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-10', dueDate: '2026-04-01' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('dueDate must be on or after doDate')
  })

  it('accepts task when dueDate equals doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-05', dueDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })

  it('accepts task with only doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })

  it('accepts task with only dueDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, dueDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx vitest run src/__tests__/tasks.test.ts`
Expected: PASS (all tests)

- [ ] **Step 3: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/__tests__/tasks.test.ts
git commit -m "epic2: add tests for completedAt auto-set/clear and date validation"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Task type with doDate, dueDate, priority, notes, manualOrder, completedAt | Task 1 |
| CreateTaskInput with doDate, dueDate, priority | Task 1 |
| UpdateTaskInput with doDate, dueDate, priority, completedAt, manualOrder, notes | Task 1 |
| Date validation (dueDate >= doDate) | Task 4 |
| Reconciliation function in reconciliation.ts | Task 2 |
| Reconciliation on readBoard() | Task 3 |
| Reconciliation on createTask() | Task 3 |
| Reconciliation on updateTask() | Task 3 |
| completedAt auto-set on Done enter | Task 3 |
| completedAt auto-clear on Done exit | Task 3 |
| Backlog sort by doDate/dueDate/createdAt | Task 5 |
| Today sort by manualOrder | Task 5 |
| Done sort by completedAt descending | Task 5 |
| Custom columns sort by manualOrder | Task 5 |
| Sync client types | Task 5 |
| Tests for reconciliation logic | Task 2 |
| Tests for completedAt behavior | Task 6 |
| Tests for date validation | Task 6 |
