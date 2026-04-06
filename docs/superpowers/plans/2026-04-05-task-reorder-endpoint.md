# Task Reorder Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/tasks/reorder` endpoint with fractional ordering. Remove `manualOrder` from Task and UpdateTaskInput types. Replace client-side reorder logic with server call.

**Architecture:** Backend owns reordering logic. Client sends `taskId`, `targetColumnId`, `newIndex`. Server computes `order` using midpoint formula with renumber fallback when gap < 0.001. Returns affected tasks.

**Tech Stack:** Express + TypeScript (server), React + TypeScript (client), Vitest (tests)

---

## Files

### Server
- Modify: `server/src/types.ts` — remove `manualOrder` from `UpdateTaskInput`
- Modify: `server/src/store/boardStore.ts` — add `reorderTasks()`, remove `manualOrder` from `updateTask()`
- Modify: `server/src/routes/tasks.ts` — add `POST /tasks/reorder` route

### Client
- Modify: `client/src/types.ts` — remove `manualOrder` from `Task` and `UpdateTaskInput`
- Modify: `client/src/api.ts` — add `reorderTasks` method
- Modify: `client/src/components/BoardView.tsx` — replace client-side reorder logic with `api.reorderTasks()`, simplify `sortTasksForColumn`

### Tests
- Create: `server/src/__tests__/tasks.reorder.test.ts` — unit tests for `reorderTasks()`

---

## Task 1: Remove `manualOrder` from server types

**Files:**
- Modify: `server/src/types.ts:60-70`

- [ ] **Step 1: Edit UpdateTaskInput in server/src/types.ts**

Remove `manualOrder?: number` from `UpdateTaskInput`. The type should be:

```typescript
export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high' | null
  completedAt?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): remove manualOrder from UpdateTaskInput"
```

---

## Task 2: Add `reorderTasks()` to boardStore.ts

**Files:**
- Modify: `server/src/store/boardStore.ts` — add `reorderTasks()` function, remove `manualOrder` handling from `updateTask()`

- [ ] **Step 1: Add GAP_THRESHOLD constant and `reorderTasks()` function**

Add these at the top of `boardStore.ts` after the existing imports, before the `ensureDataDir()` function:

```typescript
const ORDER_GAP_THRESHOLD = 0.001
```

Add the `reorderTasks` function after the existing `deleteTask` function (at the end of the file):

```typescript
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
    const prevOrder = newIndex > 0 ? colTasks[newIndex - 1].order : -Infinity
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
```

- [ ] **Step 2: Remove `manualOrder` handling from `updateTask()`**

In the `updateTask` function around line 310, remove:
```typescript
if (updates.manualOrder !== undefined) task.manualOrder = updates.manualOrder
```

Also remove `manualOrder` from the function's updates parameter type (around line 276).

- [ ] **Step 3: Run server tests to verify nothing is broken**

```bash
cd /Users/shumanliu/Projects/psyboard/server && npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/store/boardStore.ts
git commit -m "feat(server): add reorderTasks with fractional ordering"
```

---

## Task 3: Add `POST /api/tasks/reorder` route

**Files:**
- Modify: `server/src/routes/tasks.ts`

- [ ] **Step 1: Add import for `reorderTasks`**

In `server/src/routes/tasks.ts`, update the import from `boardStore.js`:

```typescript
import { createTask, updateTask, deleteTask, readBoard, reorderTasks } from '../store/boardStore.js'
```

- [ ] **Step 2: Add the reorder route after the existing routes (before the export)**

Add this route at the end of the file, before `export default router`:

```typescript
router.post('/reorder', (req, res) => {
  const { taskId, targetColumnId, newIndex } = req.body as {
    taskId?: string
    targetColumnId?: string
    newIndex?: number
  }

  if (!taskId || typeof taskId !== 'string' || taskId.length < 10) {
    res.status(400).json({ error: 'Invalid taskId' })
    return
  }
  if (!targetColumnId || typeof targetColumnId !== 'string') {
    res.status(400).json({ error: 'Invalid targetColumnId' })
    return
  }
  if (typeof newIndex !== 'number' || newIndex < 0 || !Number.isInteger(newIndex)) {
    res.status(400).json({ error: 'newIndex must be a non-negative integer' })
    return
  }

  try {
    const tasks = reorderTasks(taskId, targetColumnId, newIndex)
    res.json({ tasks })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Failed to reorder tasks' })
  }
})
```

- [ ] **Step 3: Run server tests**

```bash
cd /Users/shumanliu/Projects/psyboard/server && npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/tasks.ts
git commit -m "feat(server): add POST /api/tasks/reorder endpoint"
```

---

## Task 4: Write unit tests for `reorderTasks`

**Files:**
- Create: `server/src/__tests__/tasks.reorder.test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { reorderTasks, readBoard, writeBoard } from '../store/boardStore.js'
import { randomUUID } from 'crypto'

// Helper to create a minimal board for testing
function createTestBoard() {
  const backlogId = 'col-backlog'
  const todayId = 'col-today'
  const doneId = 'col-done'
  return {
    columns: [
      { id: backlogId, title: 'Backlog', kind: 'system' as const, systemKey: 'backlog' as const, position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: todayId, title: 'Today', kind: 'system' as const, systemKey: 'today' as const, position: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: doneId, title: 'Done', kind: 'system' as const, systemKey: 'done' as const, position: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ],
    tasks: [],
  }
}

describe('reorderTasks', () => {
  beforeEach(() => {
    const board = createTestBoard()
    writeBoard(board)
  })

  it('should throw if task not found', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    expect(() => reorderTasks('nonexistent-id', todayId, 0)).toThrow('Task not found')
  })

  it('should throw if target column not found', () => {
    const board = readBoard()
    const task = { id: randomUUID(), title: 'Test', columnId: board.columns[0].id, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)
    expect(() => reorderTasks(task.id, 'nonexistent-col', 0)).toThrow('Column not found')
  })

  it('should renumber column when inserting at start (fractional placement)', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task3 = { id: randomUUID(), title: 'Task 3', columnId: todayId, order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2, task3)
    writeBoard(board)

    // Move task3 to position 0
    const affected = reorderTasks(task3.id, todayId, 0)

    // task3 should be at order 0, task1 at 1, task2 at 2
    const sorted = affected.sort((a, b) => a.order - b.order)
    expect(sorted.map(t => t.order)).toEqual([0, 1, 2])
    expect(sorted[0].id).toBe(task3.id)
  })

  it('should use fractional midpoint when gap is sufficient', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2)
    writeBoard(board)

    const affected = reorderTasks(task1.id, todayId, 1)

    // Should place task1 between task1's old position and task2
    // Since task1 is removed from position 0, task2 is now at index 0
    // Insert task1 at index 1 (between task2 at 0 and nothing)
    // prevOrder = -Infinity, nextOrder = Infinity... actually let's trace:
    // colTasks after removing task1 = [task2] with order 1
    // newIndex=1, prevOrder=colTasks[0].order=1, nextOrder=Infinity
    // midpoint = (1 + Infinity) / 2 = Infinity? No...
    // Actually: nextOrder = newIndex < colTasks.length ? colTasks[newIndex].order : Infinity
    // newIndex=1, colTasks.length=1, so nextOrder=Infinity
    // midpoint = (1 + Infinity) / 2 = Infinity
    // needsRenumber since !Number.isFinite(midpoint) = true
    // So it renumbers: colTasks.splice(1, 0, task1) -> [task2, task1]
    // orders: [0, 1]
    expect(affected.length).toBe(2)
    const sorted = affected.sort((a, b) => a.order - b.order)
    expect(sorted[0].id).toBe(task2.id)
    expect(sorted[1].id).toBe(task1.id)
  })

  it('should renumber source column on cross-column move', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const backlogId = board.columns.find(c => c.systemKey === 'backlog')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2)
    writeBoard(board)

    const affected = reorderTasks(task1.id, backlogId, 0)

    // Source column (today) should have only task2, renumbered to 0
    const sourceTasks = affected.filter(t => t.columnId === todayId)
    expect(sourceTasks.length).toBe(1)
    expect(sourceTasks[0].id).toBe(task2.id)
    expect(sourceTasks[0].order).toBe(0)

    // Target task should be in backlog
    const movedTask = affected.find(t => t.id === task1.id)
    expect(movedTask!.columnId).toBe(backlogId)
  })

  it('should set completedAt when moving to Done', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const doneId = board.columns.find(c => c.systemKey === 'done')!.id

    const task = { id: randomUUID(), title: 'Task', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const affected = reorderTasks(task.id, doneId, 0)
    const movedTask = affected.find(t => t.id === task.id)

    expect(movedTask!.columnId).toBe(doneId)
    expect(movedTask!.completedAt).toBeDefined()
  })

  it('should clear completedAt when moving out of Done', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const doneId = board.columns.find(c => c.systemKey === 'done')!.id

    const task = { id: randomUUID(), title: 'Task', columnId: doneId, order: 0, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const affected = reorderTasks(task.id, todayId, 0)
    const movedTask = affected.find(t => t.id === task.id)

    expect(movedTask!.columnId).toBe(todayId)
    expect(movedTask!.completedAt).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/shumanliu/Projects/psyboard/server && npm test
```

Expected: All new tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/tasks.reorder.test.ts
git commit -m "test(server): add reorderTasks unit tests"
```

---

## Task 5: Update client types

**Files:**
- Modify: `client/src/types.ts`

- [ ] **Step 1: Remove `manualOrder` from `Task` type**

In `client/src/types.ts`, remove `manualOrder?: number` from the `Task` type.

- [ ] **Step 2: Remove `manualOrder` from `UpdateTaskInput` type**

Also remove `manualOrder?: number` from `UpdateTaskInput`.

- [ ] **Step 3: Commit**

```bash
git add client/src/types.ts
git commit -m "feat(client): remove manualOrder from Task and UpdateTaskInput"
```

---

## Task 6: Add `reorderTasks` to client api.ts

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: Add `reorderTasks` method to the api object**

Add after the existing `deleteTask` method:

```typescript
reorderTasks: (taskId: string, targetColumnId: string, newIndex: number) =>
  request<{ tasks: Task[] }>('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ taskId, targetColumnId, newIndex }),
  }),
```

Note: Remove the `import('./types').Task` type annotation and use `Task` directly since `Task` is already imported at the top of the file.

- [ ] **Step 2: Commit**

```bash
git add client/src/api.ts
git commit -m "feat(client): add reorderTasks API method"
```

---

## Task 7: Update BoardView.tsx

**Files:**
- Modify: `client/src/components/BoardView.tsx`

- [ ] **Step 1: Simplify `sortTasksForColumn` for Today/custom columns**

Replace the current Today/custom column sort logic:
```typescript
// Today and custom columns — sort by manualOrder, then order as fallback
return [...tasks].sort((a, b) => {
  if (a.manualOrder !== undefined && b.manualOrder !== undefined) {
    return a.manualOrder - b.manualOrder
  } else if (a.manualOrder !== undefined) return -1
  else if (b.manualOrder !== undefined) return 1
  return a.order - b.order
})
```

With:
```typescript
// Today and custom columns — sort by order
return [...tasks].sort((a, b) => a.order - b.order)
```

- [ ] **Step 2: Replace client-side same-column reorder logic**

In `handleDragEnd` (around line 178-213), replace the entire same-column reordering block with:

```typescript
// Same-column reordering: dropped on another task
if (overTask && overTask.columnId === task.columnId) {
  const colTasks = board.tasks
    .filter(t => t.columnId === task.columnId)
    .sort((a, b) => a.order - b.order)

  const oldIndex = colTasks.findIndex(t => t.id === taskId)
  const newIndex = colTasks.findIndex(t => t.id === over.id)

  if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
    api.reorderTasks(taskId, task.columnId, newIndex).then(onRefresh).catch(console.error)
  }
  return
}
```

- [ ] **Step 3: Replace cross-column move logic for sortable columns**

Replace the block that handles moving to a different column with:

```typescript
// Moving to a different column
const targetColumn = board.columns.find(c => c.id === targetColumnId)
if (targetColumn && targetColumn.systemKey !== 'done' && targetColumn.systemKey !== 'backlog') {
  const targetTasks = board.tasks
    .filter(t => t.columnId === targetColumnId)
    .sort((a, b) => a.order - b.order)
  api.reorderTasks(taskId, targetColumnId, targetTasks.length).then(onRefresh).catch(console.error)
} else {
  api.updateTask(taskId, { columnId: targetColumnId }).then(onRefresh).catch(console.error)
}
```

- [ ] **Step 4: Run client tests**

```bash
cd /Users/shumanliu/Projects/psyboard/client && npm test
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BoardView.tsx
git commit -m "feat(client): use backend reorderTasks for task reordering"
```

---

## Task 8: Run full test suite

- [ ] **Step 1: Run both client and server tests**

```bash
cd /Users/shumanliu/Projects/psyboard/server && npm test && cd ../client && npm test
```

Expected: All tests pass on both.

- [ ] **Step 2: Commit any remaining changes**

---

## Spec Coverage Check

- [x] Remove `manualOrder` from Task type — Task 5
- [x] Remove `manualOrder` from UpdateTaskInput — Tasks 1, 5
- [x] Add `reorderTasks()` to boardStore — Task 2
- [x] Fractional ordering with renumber threshold — Task 2 (ORDER_GAP_THRESHOLD = 0.001)
- [x] Cross-column move with completedAt auto-set — Task 2
- [x] `POST /api/tasks/reorder` route — Task 3
- [x] Client `reorderTasks` API method — Task 6
- [x] Client uses `reorderTasks` instead of client-side math — Task 7
- [x] `sortTasksForColumn` simplified (no manualOrder) — Task 7
- [x] Server unit tests — Task 4
