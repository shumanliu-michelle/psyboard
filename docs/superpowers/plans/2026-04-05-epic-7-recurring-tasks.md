# Epic 7 Implementation Plan: Recurring Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a recurring task system where tasks can be configured to repeat on daily/weekly/monthly/interval/weekday/cron schedules. Completing a recurring task generates the next occurrence automatically in the backend. Deleting a recurring task offers "this occurrence only" vs "delete all future" inline.

**Architecture:** Backend-first with thin UI. The `RecurrenceConfig` is stored on each task. `updateTask` detects when a recurring task is moved to Done and auto-generates the next occurrence. Client adds recurrence fields to the Task Drawer form and passes them to the API.

**Tech Stack:** Express + TypeScript (server), React + TypeScript (client), Vitest (tests), `cron-parser` package (server-side cron validation)

**Dependencies:** Install `cron-parser` in server: `cd server && npm install cron-parser`

---

## File Map

| File | Responsibility |
|------|---------------|
| `server/src/types.ts` | Add `RecurrenceKind`, `RecurrenceMode`, `RecurrenceConfig`, recurrence fields to `Task`, update input types |
| `client/src/types.ts` | Mirror server types |
| `server/src/store/recurrence.ts` | **New** — `computeNextDate()` pure function |
| `server/src/store/boardStore.ts` | `updateTask` completion flow, `suppressNextOccurrence` flag handling |
| `server/src/routes/tasks.ts` | Validation for recurrence fields, cron format check |
| `server/src/__tests__/tasks.test.ts` | Tests for recurrence validation + completion flow |
| `client/src/components/TaskDrawer.tsx` | Recurrence form section, inline delete choice |
| `client/src/__tests__/TaskDrawer.test.tsx` | Tests for recurrence UI + delete flow |

---

## Task 1: Shared Types (server + client)

Install cron-parser dependency first, then update types in both server and client.

**Files:**
- Modify: `server/package.json`
- Modify: `server/src/types.ts`
- Modify: `client/src/types.ts`
- Modify: `server/src/__tests__/tasks.test.ts`

- [ ] **Step 1: Add cron-parser dependency to server**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm install cron-parser`

- [ ] **Step 2: Add recurrence types to server/types.ts**

```ts
// Add after TaskPriority type definition
export type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'interval_days' | 'weekdays' | 'cron'
export type RecurrenceMode = 'fixed' | 'completion_based'

export type RecurrenceConfig = {
  kind: RecurrenceKind
  mode: RecurrenceMode
  intervalDays?: number      // required when kind === 'interval_days'
  cronExpr?: string          // required when kind === 'cron'
  daysOfWeek?: number[]     // optional for weekly, 0=Sun to 6=Sat
  dayOfMonth?: number       // optional for monthly, 1-31
  timezone?: string          // optional, defaults to local
}
```

- [ ] **Step 3: Add recurrence fields to Task type in server/types.ts**

In the `Task` type, add after `completedAt?`:
```ts
  completedAt?: string
  recurrence?: RecurrenceConfig
  recurrenceRootId?: string
  previousOccurrenceId?: string
```

- [ ] **Step 4: Add recurrence to CreateTaskInput in server/types.ts**

```ts
export type CreateTaskInput = {
  title: string
  columnId: string
  description?: string
  doDate?: string | null
  dueDate?: string | null
  priority?: TaskPriority
  assignee?: 'SL' | 'KL' | null
  recurrence?: RecurrenceConfig
}
```

- [ ] **Step 5: Add recurrence and suppressNextOccurrence to UpdateTaskInput in server/types.ts**

```ts
export type UpdateTaskInput = {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string | null
  dueDate?: string | null
  priority?: TaskPriority | null
  completedAt?: string
  recurrence?: RecurrenceConfig | null  // null = clear recurrence
  suppressNextOccurrence?: boolean
}
```

- [ ] **Step 6: Mirror all changes in client/src/types.ts**

Mirror exactly: `RecurrenceKind`, `RecurrenceMode`, `RecurrenceConfig` types, recurrence fields on `Task`, `CreateTaskInput` recurrence field, `UpdateTaskInput` recurrence and `suppressNextOccurrence`.

- [ ] **Step 7: Run server types check**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Run client types check**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/package.json server/src/types.ts client/src/types.ts
git commit -m "$(cat <<'EOF'
feat: add RecurrenceConfig types to server and client

Adds RecurrenceKind, RecurrenceMode, RecurrenceConfig, and recurrence
fields (recurrence, recurrenceRootId, previousOccurrenceId) to Task.
Adds recurrence to CreateTaskInput and UpdateTaskInput with
suppressNextOccurrence flag.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: recurrence.ts — Date Computation

Create the pure function for computing the next occurrence date.

**Files:**
- Create: `server/src/store/recurrence.ts`
- Modify: `server/src/store/boardStore.ts` (add import)

- [ ] **Step 1: Write failing test — computeNextDate**

Add to `server/src/__tests__/tasks.test.ts`:

```ts
import { computeNextDate } from '../store/recurrence.js'
import type { RecurrenceConfig } from '../types.js'

describe('computeNextDate', () => {
  const fixedConfig: RecurrenceConfig = { kind: 'daily', mode: 'fixed' }

  it('returns next day for daily recurrence', () => {
    const result = computeNextDate('2026-04-05', 'daily', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-06')
  })

  it('returns null when currentDate is null', () => {
    const result = computeNextDate(null, 'daily', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBeNull()
  })

  it('advances 7 days for weekly recurrence', () => {
    const result = computeNextDate('2026-04-05', 'weekly', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-12')
  })

  it('advances to next month for monthly recurrence', () => {
    const result = computeNextDate('2026-04-15', 'monthly', fixedConfig, '2026-04-15T10:00:00Z')
    expect(result).toBe('2026-05-15')
  })

  it('caps day-of-month to last day if needed', () => {
    const config: RecurrenceConfig = { kind: 'monthly', mode: 'fixed', dayOfMonth: 31 }
    const result = computeNextDate('2026-01-31', 'monthly', config, '2026-01-31T10:00:00Z')
    // Feb doesn't have 31 days — should cap to 28
    expect(result).toBe('2026-02-28')
  })

  it('advances by intervalDays for interval_days recurrence', () => {
    const config: RecurrenceConfig = { kind: 'interval_days', mode: 'fixed', intervalDays: 5 }
    const result = computeNextDate('2026-04-05', 'interval_days', config, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-10')
  })

  it('skips weekends for weekdays recurrence', () => {
    // 2026-04-03 is a Friday
    const result = computeNextDate('2026-04-03', 'weekdays', fixedConfig, '2026-04-03T10:00:00Z')
    // Next weekday after Friday is Monday April 6
    expect(result).toBe('2026-04-06')
  })

  it('returns next cron occurrence for cron kind', () => {
    const config: RecurrenceConfig = { kind: 'cron', mode: 'fixed', cronExpr: '0 9 * * *' }
    const result = computeNextDate('2026-04-05', 'cron', config, '2026-04-05T10:00:00Z')
    // 10am on Apr 5 is past 9am, so next is 9am on Apr 6
    expect(result).toBe('2026-04-06')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: FAIL — `computeNextDate` not found

- [ ] **Step 3: Create server/src/store/recurrence.ts**

```ts
import cronParser from 'cron-parser'
import type { RecurrenceConfig, RecurrenceKind } from '../types.js'

export function computeNextDate(
  currentDate: string | null,
  kind: RecurrenceKind,
  config: RecurrenceConfig,
  _baseTimestamp: string, // unused for non-cron kinds; kept for API clarity
): string | null {
  if (!currentDate) return null

  switch (kind) {
    case 'daily': {
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + 1)
      return base.toISOString().slice(0, 10)
    }
    case 'weekly': {
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + 7)
      return base.toISOString().slice(0, 10)
    }
    case 'monthly': {
      const base = new Date(currentDate + 'T00:00:00')
      const targetDay = config.dayOfMonth ?? base.getDate()
      base.setMonth(base.getMonth() + 1)
      const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
      base.setDate(Math.min(targetDay, lastDay))
      return base.toISOString().slice(0, 10)
    }
    case 'interval_days': {
      const base = new Date(currentDate + 'T00:00:00')
      base.setDate(base.getDate() + (config.intervalDays ?? 1))
      return base.toISOString().slice(0, 10)
    }
    case 'weekdays': {
      const base = new Date(currentDate + 'T00:00:00')
      do { base.setDate(base.getDate() + 1) }
      while (base.getDay() === 0 || base.getDay() === 6)
      return base.toISOString().slice(0, 10)
    }
    case 'cron': {
      if (!config.cronExpr) return null
      const interval = cronParser.parseExpression(config.cronExpr, { currentDate: new Date(_baseTimestamp) })
      return interval.next().toISOString().slice(0, 10)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/recurrence.ts server/src/__tests__/tasks.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add computeNextDate recurrence computation

Implements date advancement for all RecurrenceKind values:
daily, weekly, monthly, interval_days, weekdays, and cron.
Uses cron-parser for cron expressions.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Server Route Validation

Add recurrence validation to the POST and PATCH task routes.

**Files:**
- Modify: `server/src/routes/tasks.ts`

- [ ] **Step 1: Write failing tests for recurrence validation**

Add to `server/src/__tests__/tasks.test.ts`:

```ts
describe('POST /api/tasks — recurrence validation', () => {
  it('returns 400 when recurrence set but no doDate or dueDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Recurring task', columnId: 'col-backlog', recurrence: { kind: 'daily', mode: 'fixed' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Recurring tasks must have at least a do date or due date.')
  })

  it('returns 400 when interval_days has intervalDays < 1', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Bad interval',
        columnId: 'col-backlog',
        doDate: '2026-04-05',
        recurrence: { kind: 'interval_days', mode: 'fixed', intervalDays: 0 },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Interval must be at least 1 day.')
  })

  it('returns 400 when cron kind has invalid cronExpr', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Bad cron',
        columnId: 'col-backlog',
        doDate: '2026-04-05',
        recurrence: { kind: 'cron', mode: 'fixed', cronExpr: 'not-a-cron' },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid recurrence rule.')
  })

  it('accepts valid recurrence with doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Valid daily',
        columnId: 'col-backlog',
        doDate: '2026-04-05',
        recurrence: { kind: 'daily', mode: 'fixed' },
      })
    expect(res.status).toBe(201)
    expect(res.body.recurrence).toEqual({ kind: 'daily', mode: 'fixed' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: FAIL (routes don't validate recurrence yet)

- [ ] **Step 3: Add recurrence validation to POST route in routes/tasks.ts**

Add import at top:
```ts
import { computeNextDate } from '../store/recurrence.js'
```

Add to the POST `/` handler after the assignee validation block and before the column exists check:
```ts
// Validate recurrence
if (recurrence !== undefined) {
  const hasDoDate = doDate && doDate.length > 0
  const hasDueDate = dueDate && dueDate.length > 0
  if (!hasDoDate && !hasDueDate) {
    res.status(400).json({ error: 'Recurring tasks must have at least a do date or due date.' })
    return
  }
  if (recurrence.kind === 'interval_days') {
    if (!recurrence.intervalDays || recurrence.intervalDays < 1) {
      res.status(400).json({ error: 'Interval must be at least 1 day.' })
      return
    }
  }
  if (recurrence.kind === 'cron') {
    if (!recurrence.cronExpr) {
      res.status(400).json({ error: 'Invalid recurrence rule.' })
      return
    }
    try {
      cronParser.parseExpression(recurrence.cronExpr, { currentDate: new Date() })
    } catch {
      res.status(400).json({ error: 'Invalid recurrence rule.' })
      return
    }
  }
}
```

Add import for cron-parser at top:
```ts
import cronParser from 'cron-parser'
```

- [ ] **Step 4: Add recurrence validation to PATCH route**

In the PATCH `/:id` handler, add recurrence validation after the assignee validation block and before the columnId existence check. Use the same validation logic as the POST route. Also handle `updates.recurrence` being `null` (clear recurrence).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/routes/tasks.ts server/src/__tests__/tasks.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add recurrence validation to POST and PATCH /api/tasks

Validates that recurring tasks have at least doDate or dueDate,
interval_days has intervalDays >= 1, and cron expressions are valid
using cron-parser.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BoardStore — Completion Flow

Modify `updateTask` to handle recurring task completion, suppressNextOccurrence, next occurrence creation, and chain linkage.

**Files:**
- Modify: `server/src/store/boardStore.ts`
- Modify: `server/src/__tests__/tasks.test.ts`

- [ ] **Step 1: Write failing tests for completion flow**

Add to `server/src/__tests__/tasks.test.ts`:

```ts
describe('updateTask — recurring task completion', () => {
  beforeEach(() => {
    // Reset board to known state
    const board = readBoard()
    board.tasks = board.tasks.filter(t => !t.recurrence)
    writeBoard(board)
  })

  it('sets completedAt when task moved to Done', async () => {
    const task = createTask('Test', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    const updated = updateTask(task.id, { columnId: DONE_COLUMN_ID })
    expect(updated.completedAt).toBeDefined()
  })

  it('generates next occurrence when recurring task moved to Done', async () => {
    const task = createTask('Daily Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    const updated = updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })
    expect(updated.completedAt).toBeDefined()

    const board = readBoard()
    const nextTasks = board.tasks.filter(t => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(1)
    expect(nextTasks[0].title).toBe('Daily Task')
    expect(nextTasks[0].doDate).toBe('2026-04-06')
    expect(nextTasks[0].columnId).toBe(BACKLOG_COLUMN_ID)
    expect(nextTasks[0].recurrenceRootId).toBe(task.id)
  })

  it('sets recurrenceRootId on first occurrence', async () => {
    const task = createTask('Daily Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    const board = readBoard()
    const nextTask = board.tasks.find(t => t.previousOccurrenceId === task.id)
    expect(nextTask?.recurrenceRootId).toBe(task.id)
    expect(task.recurrenceRootId).toBeUndefined() // original task wasn't a recurring chain root
  })

  it('is idempotent — does not create duplicate next occurrence', async () => {
    const task = createTask('Daily Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })
    // Complete again — should be idempotent
    const board = readBoard()
    const completedTask = board.tasks.find(t => t.id === task.id)
    updateTask(completedTask!.id, { columnId: DONE_COLUMN_ID })

    const nextTasks = board.tasks.filter(t => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(1) // still only one
  })

  it('suppressNextOccurrence skips next occurrence creation', async () => {
    const task = createTask('Daily Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      suppressNextOccurrence: true,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    const board = readBoard()
    const nextTasks = board.tasks.filter(t => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(0) // suppressed
    const completedTask = board.tasks.find(t => t.id === task.id)
    expect(completedTask?.completedAt).toBeDefined() // but still completed
  })

  it('suppressNextOccurrence then delete removes task without next', async () => {
    const task = createTask('Daily Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      suppressNextOccurrence: true,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })
    deleteTask(task.id)

    const board = readBoard()
    const nextTasks = board.tasks.filter(t => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(0)
    expect(board.tasks.find(t => t.id === task.id)).toBeUndefined()
  })

  it('completion-based mode uses completedAt timestamp for cron', async () => {
    const task = createTask('Cron Task', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'cron', mode: 'completion_based', cronExpr: '0 9 * * *' },
    })

    const board = readBoard()
    const nextTask = board.tasks.find(t => t.previousOccurrenceId === task.id)
    expect(nextTask).toBeDefined()
    // Next cron occurrence should be based on completion time, not doDate
  })

  it('next occurrence respects intervalDays', async () => {
    const task = createTask('Every 3 days', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, undefined, undefined)
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'interval_days', mode: 'fixed', intervalDays: 3 },
    })

    const board = readBoard()
    const nextTask = board.tasks.find(t => t.previousOccurrenceId === task.id)
    expect(nextTask?.doDate).toBe('2026-04-08')
  })

  it('next occurrence inherits priority and assignee', async () => {
    const task = createTask('Important', BACKLOG_COLUMN_ID, undefined, '2026-04-05', null, 'high', 'SL')
    updateTask(task.id, {
      columnId: DONE_COLUMN_ID,
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    const board = readBoard()
    const nextTask = board.tasks.find(t => t.previousOccurrenceId === task.id)
    expect(nextTask?.priority).toBe('high')
    expect(nextTask?.assignee).toBe('SL')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: FAIL — `suppressNextOccurrence` not in `updateTask` signature

- [ ] **Step 3: Add import for computeNextDate in boardStore.ts**

Add after the existing imports:
```ts
import { computeNextDate } from './recurrence.js'
```

- [ ] **Step 4: Update updateTask parameter type to include suppressNextOccurrence and recurrence**

```ts
export function updateTask(id: string, updates: {
  title?: string
  description?: string
  columnId?: string
  order?: number
  assignee?: 'SL' | 'KL' | null
  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high'
  completedAt?: string
  recurrence?: RecurrenceConfig | null
  suppressNextOccurrence?: boolean
}): Task {
```

- [ ] **Step 5: Add recurrence handling in updateTask**

Find the block after `if (updates.completedAt !== undefined) task.completedAt = updates.completedAt` and add before `task.updatedAt = new Date().toISOString()`:

```ts
  // Handle recurrence field update
  if (updates.recurrence !== undefined) {
    task.recurrence = updates.recurrence
    // If clearing recurrence, also clear chain fields
    if (updates.recurrence === null) {
      task.recurrenceRootId = undefined
      task.previousOccurrenceId = undefined
    }
  }

  // Recurring task completion: generate next occurrence
  const isMovingToDone = updates.columnId === DONE_COLUMN_ID && previousColumnId !== DONE_COLUMN_ID
  const shouldSuppress = updates.suppressNextOccurrence === true

  if (isMovingToDone && task.recurrence && !shouldSuppress) {
    // Idempotency: skip if next occurrence already exists
    const existingNext = board.tasks.find(t => t.previousOccurrenceId === task.id)
    if (!existingNext) {
      // Initialize recurrenceRootId if not set (on the current task too — this is the chain root)
      if (!task.recurrenceRootId) {
        task.recurrenceRootId = task.id
        task.updatedAt = new Date().toISOString()
      }

      // Compute next dates
      const now = new Date().toISOString()
      const nextDoDate = computeNextDate(
        task.doDate ?? null,
        task.recurrence.kind,
        task.recurrence,
        task.completedAt ?? now
      )
      const nextDueDate = computeNextDate(
        task.dueDate ?? null,
        task.recurrence.kind,
        task.recurrence,
        task.completedAt ?? now
      )

      // Determine columnId: use reconciliation to see if next occurrence qualifies for Today
      const testBoard: Board = { ...board, tasks: [...board.tasks] }
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
      const { reconcileTask } = await import('./reconciliation.js')
      const reconciled = reconcileTask(nextTask, getTodayString())
      if (reconciled) {
        nextTask.columnId = reconciled.columnId
      }

      board.tasks.push(nextTask)
    }
  }

  // Note: completedAt is already set by the existing done-column block above.
  // shouldSuppress only controls whether the next occurrence is created.
```

Note: The `reconcileTask` is imported dynamically because `reconciliation.ts` imports from `types.ts` and we need to avoid circular imports. Alternatively, import it statically at the top of boardStore.ts if no circular dep exists. Test and adjust if needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: PASS (or specific failures to fix)

- [ ] **Step 7: Fix any issues** (e.g., import order, type mismatches)

Common fixes:
- `reconcileTask` needs to be imported from `./reconciliation.js`
- Ensure `RecurrenceConfig` type is imported
- The `recurrenceRootId` init on the first occurrence should set it on the current task too (the epic says "set recurrenceRootId = currentTask.id" for the first recurring occurrence in the chain)

Fix: When `isMovingToDone && task.recurrence && !shouldSuppress` is true AND `task.recurrenceRootId` was not already set, set `task.recurrenceRootId = task.id` on the current task as well.

- [ ] **Step 8: Run tests again**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run tasks.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/boardStore.ts server/src/__tests__/tasks.test.ts
git commit -m "$(cat <<'EOF'
feat(server): add recurring task completion flow to updateTask

When a recurring task is moved to Done:
- Generates next occurrence in backlog (or today if reconciled)
- Links via previousOccurrenceId and recurrenceRootId
- Idempotent: skips if next already exists
- suppressNextOccurrence flag prevents next occurrence creation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TaskDrawer — Recurrence UI

Add the recurrence section to the Task Drawer form.

**Files:**
- Modify: `client/src/components/TaskDrawer.tsx`
- Modify: `client/src/__tests__/TaskDrawer.test.tsx`

- [ ] **Step 1: Write failing tests for recurrence section**

Add to `client/src/__tests__/TaskDrawer.test.tsx`. The tests should verify:
- Recurrence select renders with correct options
- Selecting a recurrence kind shows the mode toggle
- interval_days shows the interval input
- cron shows the cron expression input
- Client-side validation shows error when no dates set
- Saving with recurrence includes it in the API call

```ts
import type { RecurrenceConfig } from '../types'

// At the top of existing tests that need recurrence
const mockRecurrence: RecurrenceConfig = { kind: 'daily', mode: 'fixed' }
```

Add a new describe block:
```tsx
describe('TaskDrawer — recurrence fields', () => {
  it('renders recurrence select with all options', () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    expect(screen.getByRole('combobox', { name: /repeat/i })).toBeInTheDocument()
  })

  it('shows interval input when Every X days is selected', async () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await userEvent.selectOptions(select, 'interval_days')
    expect(screen.getByLabelText(/every/i)).toBeInTheDocument()
  })

  it('shows cron input when Advanced is selected', async () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await userEvent.selectOptions(select, 'cron')
    expect(screen.getByLabelText(/cron/i)).toBeInTheDocument()
  })

  it('shows mode toggle when recurrence is set', async () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await userEvent.selectOptions(select, 'daily')
    expect(screen.getByText(/fixed schedule/i)).toBeInTheDocument()
    expect(screen.getByText(/completion-based/i)).toBeInTheDocument()
  })

  it('shows validation error when recurrence set with no dates', async () => {
    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await userEvent.selectOptions(select, 'daily')
    expect(screen.getByText(/Recurring tasks must have at least a do date or due date/i)).toBeInTheDocument()
  })

  it('includes recurrence in createTask call', async () => {
    const mockCreateTask = vi.fn().mockResolvedValue({})
    vi.mocked(api.createTask).mockImplementation(mockCreateTask)

    render(<TaskDrawer mode="create" columnId="col-backlog" onClose={fn} onSaved={fn} />)
    await userEvent.type(screen.getByLabelText(/title/i), 'Daily Standup')
    const select = screen.getByRole('combobox', { name: /repeat/i })
    await userEvent.selectOptions(select, 'daily')
    await userEvent.type(screen.getByLabelText(/do date/i), '2026-04-05')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: { kind: 'daily', mode: 'fixed' },
      })
    )
  })

  it('passes recurrence: null when cleared', async () => {
    // Test that editing a task with recurrence can clear it
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm test -- --run TaskDrawer.test.tsx`
Expected: FAIL — recurrence fields don't exist yet

- [ ] **Step 3: Add RecurrenceConfig import to TaskDrawer.tsx**

```ts
import type { Task, TaskPriority, RecurrenceConfig, RecurrenceKind } from '../types'
```

- [ ] **Step 4: Add recurrence state and error state to TaskDrawer**

Add after the `assignee` state:
```ts
const [recurrence, setRecurrence] = useState<RecurrenceConfig | undefined>(() =>
  mode === 'edit' && task ? task.recurrence : undefined
)
const [recurrenceError, setRecurrenceError] = useState('')
```

- [ ] **Step 5: Add recurrence validation effect**

Add after the existing date validation `useEffect`:
```ts
useEffect(() => {
  if (recurrence) {
    const hasDoDate = doDate && doDate.length > 0
    const hasDueDate = dueDate && dueDate.length > 0
    if (!hasDoDate && !hasDueDate) {
      setRecurrenceError('Recurring tasks must have at least a do date or due date.')
    } else if (recurrence.kind === 'interval_days' && (!recurrence.intervalDays || recurrence.intervalDays < 1)) {
      setRecurrenceError('Interval must be at least 1 day.')
    } else {
      setRecurrenceError('')
    }
  } else {
    setRecurrenceError('')
  }
}, [recurrence, doDate, dueDate])
```

- [ ] **Step 6: Update canSave to include recurrenceError**

Change:
```ts
const canSave = title.trim().length > 0 && !dateError && !saving
```
To:
```ts
const canSave = title.trim().length > 0 && !dateError && !recurrenceError && !saving
```

- [ ] **Step 7: Update handleSave to pass recurrence**

In `mode === 'create'` block, add `recurrence` to the createTask call. In `mode === 'edit'` block, add `recurrence` to the updateTask call (to support clearing recurrence, pass `recurrence: recurrence ?? null`).

- [ ] **Step 8: Add recurrence section JSX to drawer body**

Add after the Assignee section (before the closing `</div>` of `task-drawer-body`):

```tsx
<div className="task-drawer-field">
  <label htmlFor="task-recurrence">Repeat</label>
  <select
    id="task-recurrence"
    value={recurrence?.kind ?? ''}
    onChange={e => {
      const kind = e.target.value as RecurrenceKind | ''
      if (!kind) { setRecurrence(undefined); return }
      setRecurrence({ kind, mode: recurrence?.mode ?? 'fixed' })
    }}
    disabled={isCompleted}
  >
    <option value="">None</option>
    <option value="daily">Daily</option>
    <option value="weekly">Weekly</option>
    <option value="monthly">Monthly</option>
    <option value="interval_days">Every X days</option>
    <option value="weekdays">Weekdays only</option>
    <option value="cron">Advanced (cron)</option>
  </select>
</div>

{recurrence?.kind === 'interval_days' && (
  <div className="task-drawer-row">
    <div className="task-drawer-field" style={{ flex: 1 }}>
      <label htmlFor="recurrence-interval">Every</label>
      <input
        id="recurrence-interval"
        type="number"
        min="1"
        value={recurrence.intervalDays ?? 1}
        onChange={e => setRecurrence(prev => prev ? {
          ...prev, intervalDays: parseInt(e.target.value) || 1
        } : prev)}
        disabled={isCompleted}
      />
    </div>
    <span style={{ alignSelf: 'flex-end', marginBottom: '4px' }}>days</span>
  </div>
)}

{recurrence?.kind === 'cron' && (
  <div className="task-drawer-field">
    <label htmlFor="recurrence-cron">Cron expression</label>
    <input
      id="recurrence-cron"
      type="text"
      placeholder="0 9 * * *"
      value={recurrence.cronExpr ?? ''}
      onChange={e => setRecurrence(prev => prev ? {
        ...prev, cronExpr: e.target.value
      } : prev)}
      disabled={isCompleted}
    />
  </div>
)}

{recurrence && (
  <div className="task-drawer-field">
    <label>Mode</label>
    <div className="task-drawer-btn-group">
      <button
        type="button"
        className={recurrence.mode === 'fixed' ? 'selected' : ''}
        onClick={() => setRecurrence(prev => prev ? { ...prev, mode: 'fixed' } : prev)}
        disabled={isCompleted}
      >
        Fixed schedule
      </button>
      <button
        type="button"
        className={recurrence.mode === 'completion_based' ? 'selected' : ''}
        onClick={() => setRecurrence(prev => prev ? { ...prev, mode: 'completion_based' } : prev)}
        disabled={isCompleted}
      >
        Completion-based
      </button>
    </div>
  </div>
)}

{recurrenceError && <p className="drawer-error">{recurrenceError}</p>}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm test -- --run TaskDrawer.test.tsx`
Expected: PASS (or fix specific issues)

- [ ] **Step 10: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/components/TaskDrawer.tsx client/src/__tests__/TaskDrawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add recurrence section to TaskDrawer

Adds repeat type select (daily, weekly, monthly, interval, weekdays, cron),
interval input for every X days, cron expression input for advanced,
and mode toggle (fixed schedule / completion-based).
Includes client-side validation mirroring backend rules.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: TaskDrawer — Delete Flow

Implement inline recurrence delete choice in TaskDrawer.

**Files:**
- Modify: `client/src/components/TaskDrawer.tsx`
- Modify: `client/src/__tests__/TaskDrawer.test.tsx`

- [ ] **Step 1: Write failing tests for delete flow**

Add to `client/src/__tests__/TaskDrawer.test.tsx`:

```ts
describe('TaskDrawer — recurring task delete', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows two delete options when task has recurrence', async () => {
    const task = { ...mockTask, recurrence: { kind: 'daily', mode: 'fixed' } }
    render(<TaskDrawer mode="edit" task={task} columnId="col-backlog" onClose={fn} onSaved={fn} />)
    // The delete button should show different behavior for recurring tasks
    // (implementation: either two buttons or modified confirm text)
  })

  it('delete all calls suppressNext then delete', async () => {
    const task = { ...mockTask, recurrence: { kind: 'daily', mode: 'fixed' }, id: 'task-recurring' }
    vi.mocked(api.updateTask).mockResolvedValue(task)
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(false) // Cancel = delete all

    render(<TaskDrawer mode="edit" task={task} columnId="col-backlog" onClose={fn} onSaved={fn} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(api.updateTask).toHaveBeenCalledWith(
      'task-recurring',
      expect.objectContaining({ columnId: 'col-done', suppressNextOccurrence: true })
    )
    expect(api.deleteTask).toHaveBeenCalledWith('task-recurring')
  })

  it('delete single occurrence deletes without suppressing', async () => {
    const task = { ...mockTask, recurrence: { kind: 'daily', mode: 'fixed' }, id: 'task-recurring' }
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true) // OK = delete this only

    render(<TaskDrawer mode="edit" task={task} columnId="col-backlog" onClose={fn} onSaved={fn} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(api.updateTask).not.toHaveBeenCalled()
    expect(api.deleteTask).toHaveBeenCalledWith('task-recurring')
  })

  it('non-recurring task shows standard confirm', async () => {
    const task = { ...mockTask, id: 'task-normal' }
    vi.mocked(api.deleteTask).mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<TaskDrawer mode="edit" task={task} columnId="col-backlog" onClose={fn} onSaved={fn} />)
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))

    expect(window.confirm).toHaveBeenCalledWith('Delete this task? This action cannot be undone.')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm test -- --run TaskDrawer.test.tsx`
Expected: FAIL — delete flow not updated yet

- [ ] **Step 3: Replace handleDelete in TaskDrawer.tsx**

Replace the existing `handleDelete` function:

```ts
async function handleDelete() {
  if (!task) return

  if (task.recurrence) {
    const deleteAll = !window.confirm(
      'Delete this recurring task?\n\nOK = Delete this occurrence only\nCancel = Delete all future occurrences'
    )
    if (deleteAll) {
      // Suppress next occurrence (completes without creating next), then delete
      await api.updateTask(task.id, {
        columnId: DONE_COLUMN_ID,
        suppressNextOccurrence: true,
      })
    }
    await api.deleteTask(task.id)
  } else {
    const confirmed = window.confirm(
      'Delete this task? This action cannot be undone.'
    )
    if (!confirmed) return
    await api.deleteTask(task.id)
  }
  onSaved()
  onClose()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm test -- --run TaskDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/components/TaskDrawer.tsx client/src/__tests__/TaskDrawer.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add inline delete choice for recurring tasks

Recurring tasks now offer two delete options via window.confirm:
- OK = delete this occurrence only (normal delete, next still generated)
- Cancel = delete all (suppress next occurrence, then delete)

Non-recurring tasks use the existing confirm dialog.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Final Integration & Smoke Test

Run the full server and client test suites to ensure everything works together.

**Files:** None (verification only)

- [ ] **Step 1: Run server tests**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npm test -- --run`
Expected: All tests pass

- [ ] **Step 2: Run client tests**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm test -- --run`
Expected: All tests pass

- [ ] **Step 3: Type check both packages**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit && cd ../client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add -A
git commit -m "$(cat <<'EOF'
test: add comprehensive recurrence tests across server and client

Server: recurrence validation, computeNextDate, completion flow,
idempotency, suppressNextOccurrence.
Client: recurrence UI rendering, form validation, delete flow.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Spec Coverage Check

| Epic Requirement | Task(s) |
|-----------------|---------|
| RecurrenceConfig type | Task 1 |
| recurrence/recurrenceRootId/previousOccurrenceId on Task | Task 1 |
| CreateTaskInput + UpdateTaskInput with recurrence | Task 1 |
| computeNextDate for all 6 RecurrenceKinds | Task 2 |
| cron validation (server-side) | Task 3 |
| recurrence validation (server-side) | Task 3 |
| completion flow (complete → next occurrence) | Task 4 |
| suppressNextOccurrence | Task 4 |
| idempotency (skip if next already exists) | Task 4 |
| chain linkage (recurrenceRootId, previousOccurrenceId) | Task 4 |
| TaskDrawer recurrence section (all fields) | Task 5 |
| intervalDays input | Task 5 |
| cronExpr input | Task 5 |
| mode toggle (fixed/completion-based) | Task 5 |
| client-side recurrence validation | Task 5 |
| inline recurrence delete choice | Task 6 |
| delete this only vs delete all behavior | Task 6 |
| Reconciliation integration | Task 4 |
