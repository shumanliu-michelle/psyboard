# Epic 2: Task Model & Reconciliation — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Summary

Extend the Task data model with `doDate`, `dueDate`, `priority`, `manualOrder`, and `completedAt`. Implement column-aware sorting (Backlog by dates, Today by manualOrder, Done by completedAt). Implement a backend reconciliation function that promotes date-eligible tasks into Today.

---

## Data Model

### Task type

```ts
export type TaskPriority = 'low' | 'medium' | 'high'

export type Task = {
  id: string
  title: string
  notes?: string
  columnId: string

  doDate?: string      // YYYY-MM-DD — when user plans to work on it
  dueDate?: string      // YYYY-MM-DD — deadline
  priority?: TaskPriority
  assignee?: string

  manualOrder?: number  // for manual ordering in Today and custom columns
  order: number        // kept for v1 compatibility (still used by existing sort)

  createdAt: string
  updatedAt: string
  completedAt?: string  // ISO datetime — set when moved to Done, cleared when moved out
}
```

### Changes to existing types

- `CreateTaskInput` adds: `doDate?`, `dueDate?`, `priority?`
- `UpdateTaskInput` adds: `doDate?`, `dueDate?`, `priority?`, `completedAt?`, `manualOrder?`, `notes?`
- `assignee` remains `string | undefined` (no enum, supports future assignees beyond SL/KL)

---

## Validation Rules

| Rule | Behavior |
|---|---|
| `doDate` and `dueDate` both present | `dueDate >= doDate` must hold (enforced at API layer) |
| `dueDate` without `doDate` | Valid (dueDate acts as fallback scheduling) |
| Neither date present | Valid (undated task) |
| Moving task into Done | `completedAt = now` (ISO string) |
| Moving task out of Done | `completedAt = undefined` |
| Task with `doDate <= today` in Backlog | Eligible for reconciliation into Today |
| Task with `dueDate <= today` and no `doDate` in Backlog | Eligible for reconciliation into Today |

---

## Sorting Behavior

### Backlog
Sort tasks by:
1. `doDate` ascending (earliest first)
2. if `doDate` is missing, `dueDate` ascending
3. tasks with neither date appear below dated tasks
4. `createdAt` as final tie-breaker

### Today
- Sort by `manualOrder` ascending
- Tasks without `manualOrder` fall to the end (or use `order` as fallback for migrated tasks)

### Done
- Sort by `completedAt` descending (most recently completed first)

### Custom columns
- Sort by `manualOrder` ascending
- Tasks without `manualOrder` fall to the end

---

## Reconciliation

### Location
`server/src/store/reconciliation.ts` — a pure function called by `readBoard()`.

### When it runs
Reconciliation runs in three places:

1. **`readBoard()`** — on app init and page load/reload
2. **`createTask()`** — after the task is created and persisted
3. **`updateTask()`** — after any task update is persisted

Each trigger is independent — reconciliation checks all eligible tasks each time, so no need to track "pending" promotions.

### Scope
Only tasks that are:
- NOT in Done (`columnId !== DONE_COLUMN_ID`)
- NOT already in Today (`columnId !== TODAY_COLUMN_ID`)

### Logic

```ts
function reconcileTask(task: Task, today: string): Task | null {
  // Already in Today or Done — skip
  if (task.columnId === TODAY_COLUMN_ID || task.columnId === DONE_COLUMN_ID) {
    return null
  }

  // Today promotion rule
  const doDateOk = task.doDate !== undefined && task.doDate <= today
  const dueDateFallback = task.doDate === undefined
    && task.dueDate !== undefined
    && task.dueDate <= today

  if (doDateOk || dueDateFallback) {
    return { ...task, columnId: TODAY_COLUMN_ID }
  }

  return null
}
```

### Behavior
- Reconciliation modifies the in-memory board and persists the changed tasks
- Only updates `columnId` — does NOT modify `doDate`, `dueDate`, or any other field
- Runs after `migrateAndHeal()` on every `readBoard()`
- Logs number of tasks promoted to console (for debugging)

---

### Reconciliation caller

After `createTask()` persists and after `updateTask()` persists, call `reconcileBoard(board)` to promote any newly eligible tasks. The `reconcileBoard` function reads the current board, applies reconciliation, and persists the result.

### `POST /api/tasks` — `CreateTaskInput`

Request body gains:
```ts
{ title, columnId, description?, doDate?, dueDate?, priority? }
```

Validation:
- If `doDate` and `dueDate` both present, validate `dueDate >= doDate`
- If invalid, return `400` with `{ error: "dueDate must be on or after doDate" }`

### `PATCH /api/tasks/:id` — `UpdateTaskInput`

Request body gains:
```ts
{ title?, description?, columnId?, order?, assignee?, doDate?, dueDate?, priority?, completedAt?, manualOrder? }
```

Special behavior:
- If `columnId` changes TO `col-done` → set `completedAt = now`
- If `columnId` changes FROM `col-done` → clear `completedAt`
- Date validation same as create

### `GET /api/board`

Returns board with all task fields including new ones.

---

## Frontend Changes (Epic 2 scope)

**Minimal:** Sync `types.ts` to match new Task model. No new UI for dates — that is Epic 3.

The `BoardView` column task sorting must use the correct field per column:
- `col-backlog` → sort by doDate/dueDate/createdAt
- `col-today` → sort by manualOrder
- `col-done` → sort by completedAt
- Custom columns → sort by manualOrder

---

## Migration (backward compatibility)

Existing tasks in `board.json` that lack new fields:
- `doDate`, `dueDate`, `priority`, `notes`, `manualOrder`, `completedAt` → treat as `undefined`
- `order` field is preserved for v1 compatibility (used as tie-breaker and for task ordering within columns)

---

## Scope

**In scope:**
- Task type with new fields (doDate, dueDate, priority, notes, manualOrder, completedAt)
- Date validation (dueDate >= doDate)
- API support for all new fields
- Reconciliation engine in `reconciliation.ts`
- Column-aware task sorting (Backlog by dates, Today/Done/custom by manualOrder or completedAt)
- Auto-heal on load (already exists from Epic 1)
- completedAt auto-set/clear on Done enter/exit

**Out of scope:**
- Date display on TaskCard (Epic 3)
- Task creation form with date pickers (Epic 3)
- Drag restrictions based on date rules (Epic 4)
- Overdue visual styling (Epic 3)
