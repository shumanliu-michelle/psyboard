# Task Reorder Refactor — Backend-Owned Ordering

## Context

Task reordering is currently calculated client-side in `BoardView.tsx` using `manualOrder` averaging/halving. This causes precision drift (0.5 → 0.25 → 0.125...) and conflicts with the existing `order` property. The goal is to move reordering logic to the backend, consistent with how column reordering already works via `POST /columns/reorder`.

## Problem

- Client calculates new `manualOrder` by halving or averaging adjacent task values
- Tasks have both `order` (numeric) and `manualOrder` (optional numeric) — confusing
- Precision drift over time makes ordering unstable
- `manualOrder` is only partially supported (Today/custom columns, not Backlog/Done)
- Sorting logic is split: Backlog/Done auto-sorted, Today/custom use manual, creating edge cases

## Design Decision

Remove `manualOrder` entirely. For **Today and custom columns**: use `order` for manual ordering (user drags to reorder, new tasks append to bottom). **Backlog and Done** retain their current auto-sort behavior (Backlog: doDate/dueDate/createdAt, Done: completedAt descending).

## Types

### Task (updated)

```typescript
export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number           // used for manual ordering in Today/custom columns; auto-sorted in Backlog/Done

  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high'
  assignee?: 'SL' | 'KL' | undefined

  createdAt: string
  updatedAt: string
  completedAt?: string
}
```

`manualOrder` is removed.

### UpdateTaskInput (updated)

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

`manualOrder` is removed.

## New Endpoint

### `POST /api/tasks/reorder`

Reorder a task within or across columns. The server computes new `order` values for all affected tasks.

**Request body:**

```typescript
{
  taskId: string       // ID of the task being moved
  targetColumnId: string
  newIndex: number     // Position to insert in target column (0-based)
}
```

**Response (200):**

```typescript
{
  tasks: Task[]  // All tasks that were updated (source column + target column tasks)
}
```

**Errors:**
- `400` — Invalid input (missing fields, invalid UUID format)
- `404` — Task or column not found
- `500` — Server error

**Validation:**
- `taskId` must be a valid task ID (≥10 chars)
- `targetColumnId` must exist in the board
- `newIndex` must be a non-negative integer

## Backend Logic

### `reorderTasks(taskId: string, targetColumnId: string, newIndex: number): Task[]`

In `boardStore.ts`:

1. Read the board
2. Find the task being moved — throw if not found
3. Determine source column (from the task's current `columnId`)
4. Get tasks in source column, sorted by `order` — call this `sourceTasks`
5. Get tasks in target column, sorted by `order` — call this `targetTasks`
6. Remove the moved task from source column

   **If source column === target column (same-column reorder):**
   - The removed task is still in memory (not yet removed from array)
   - Insert it at `newIndex` in `targetTasks`
   - Assign `order = index` to every task in `targetTasks`
   - Update `task.updatedAt` for all

   **If source column ≠ target column (cross-column move):**
   - Append moved task to end of `targetTasks`
   - Assign `order = index` to every task in `targetTasks`
   - For source column: re-assign `order = index` to remaining source tasks
   - Update `task.updatedAt` for all
   - Set `task.columnId = targetColumnId`
   - Set `task.order = newIndex` (already set by step above)
   - Auto-set `completedAt` when moving into Done, clear when moving out (already handled by `updateTask` logic, but this is a direct write so we replicate that behavior)

7. Write the board
8. Return all affected tasks

## API Layer

### `POST /api/tasks/reorder` (in `server/src/routes/tasks.ts`)

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

## Client Changes

### `client/src/api.ts`

Add `reorderTasks`:

```typescript
reorderTasks: (taskId: string, targetColumnId: string, newIndex: number) =>
  request<{ tasks: Task[] }>('/tasks/reorder', {
    method: 'POST',
    body: JSON.stringify({ taskId, targetColumnId, newIndex }),
  }),
```

### `client/src/types.ts`

- Remove `manualOrder` from `Task`
- Remove `manualOrder` from `UpdateTaskInput`

### `client/src/components/BoardView.tsx`

Replace the client-side reordering logic (lines 178-211) with a call to `api.reorderTasks()`:

```typescript
// Same-column reordering
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

Cross-column move (when dropping on empty column area):

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

Remove `manualOrder` from `sortTasksForColumn` — simplify Today/custom columns to:

```typescript
return [...tasks].sort((a, b) => a.order - b.order)
```

### `client/src/__tests__/TaskDrawer.test.tsx` and `QuickAddForm.test.tsx`

Update any `manualOrder` references in tests.

## Migration

Existing tasks with `manualOrder` values: when read from storage, `manualOrder` is simply ignored. On any subsequent write (PATCH or reorder), `manualOrder` is not written back, effectively phasing it out.

## Testing

1. **Same-column reorder** — drag task A from position 2 to position 0 in Today column; all task orders should update
2. **Cross-column move** — drag task from Today to custom column; orders update in both columns
3. **New task appends** — create new task in Today; it gets `order = tasksInColumn.length`
4. **Backlog/Done unaffected** — reordering in Backlog/Done still uses auto-sort (doDate/dueDate/completedAt), not `order`
5. **Migration** — existing tasks with `manualOrder` load and display correctly using `order`
