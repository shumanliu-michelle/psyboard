# Epic 7 Design: Recurring Tasks

## Overview

Flexible recurring task system with backend-generated next occurrences and task-drawer configuration. Supports both fixed schedules and completion-based schedules. Each occurrence exists independently on the board — only one occurrence is on the board at a time.

---

## Data Model

### Shared Types (server `src/types.ts` and client `src/types.ts`)

```ts
export type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'interval_days' | 'weekdays' | 'cron'
export type RecurrenceMode = 'fixed' | 'completion_based'

export type RecurrenceConfig = {
  kind: RecurrenceKind
  mode: RecurrenceMode
  intervalDays?: number      // required when kind === 'interval_days'
  cronExpr?: string          // required when kind === 'cron'
  daysOfWeek?: number[]     // optional for weekly, 0=Sun to 6=Sat
  dayOfMonth?: number       // optional for monthly, 1-31
  timezone?: string         // optional, defaults to local
}

export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number
  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high'
  assignee?: 'SL' | 'KL' | undefined
  createdAt: string
  updatedAt: string
  completedAt?: string
  recurrence?: RecurrenceConfig
  recurrenceRootId?: string    // set on first occurrence, shared across chain
  previousOccurrenceId?: string // set on each generated occurrence
}
```

### Input Types

```ts
export type CreateTaskInput = {
  title: string
  columnId: string
  description?: string
  doDate?: string | null
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high'
  assignee?: 'SL' | 'KL' | null
  recurrence?: RecurrenceConfig
}

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
  recurrence?: RecurrenceConfig | null   // null = clear recurrence
  suppressNextOccurrence?: boolean      // suppresses next occurrence on completion
}
```

---

## Backend: Validation

### Recurrence Validation Rules (in `POST /api/tasks` and `PATCH /api/tasks/:id`)

| Rule | Error Message |
|------|---------------|
| `recurrence` set but both `doDate` and `dueDate` empty | `Recurring tasks must have at least a do date or due date.` |
| `kind === 'interval_days'` and `intervalDays < 1` | `Interval must be at least 1 day.` |
| `kind === 'cron'` and `cronExpr` invalid | `Invalid recurrence rule.` |
| Both dates exist and `dueDate < doDate` | `Due date cannot be earlier than do date.` (existing rule) |

---

## Backend: Date Computation

### New file `server/src/store/recurrence.ts`

```ts
import cronParser from 'cron-parser'

export function computeNextDate(
  currentDate: string | null,   // YYYY-MM-DD
  kind: RecurrenceKind,
  config: RecurrenceConfig,
  baseTimestamp: string        // ISO datetime — completion time for completion-based, currentDate for fixed
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
      const next = cronParser.nextInstance(config.cronExpr!, new Date(baseTimestamp))
      return next.toISOString().slice(0, 10)
    }
  }
}
```

**Fixed vs completion-based**: For non-cron kinds, computation is always based on `currentDate` (the scheduled date), regardless of mode. `baseTimestamp` is only used for the `cron` kind:
- **Fixed**: `baseTimestamp` is ignored for non-cron; `currentDate` is used as the base
- **Completion-based**: `baseTimestamp` is the `completedAt` timestamp (used only for cron)

---

## Backend: Completion Flow

### Modified `updateTask` in `boardStore.ts`

When a task is updated with `columnId = DONE_COLUMN_ID` and has `recurrence` and `suppressNextOccurrence !== true`:

1. **Complete current task** (existing done-column logic applies — set `completedAt`)
2. **Idempotency guard**: skip if `board.tasks.some(t => t.previousOccurrenceId === task.id)`
3. **Compute next dates**: call `computeNextDate` for `doDate` and `dueDate`:
   - For fixed mode: pass `currentDate` as `baseTimestamp` (ignored for non-cron anyway)
   - For completion-based mode: pass `completedAt` as `baseTimestamp`
4. **Determine recurrence root**: `recurrenceRootId = task.recurrenceRootId ?? task.id`
5. **Create next occurrence** in `BACKLOG_COLUMN_ID`:
   - Copy: `title`, `description`, `priority`, `assignee`, `recurrence`
   - Set: `doDate`, `dueDate` from step 3, `recurrenceRootId`, `previousOccurrenceId = task.id`
   - Set: `columnId = BACKLOG_COLUMN_ID`, `completedAt = undefined`, `order` via normal insertion logic
6. **Reconciliation**: call `reconcileBoard` — promotes next occurrence to `TODAY_COLUMN_ID` if eligible

### `suppressNextOccurrence` flow

When `suppressNextOccurrence === true` is set alongside `columnId = DONE_COLUMN_ID`:
- Steps 2–5 are skipped (no next occurrence is created)
- `completedAt` is still set (task is completed)
- Task remains in `DONE_COLUMN_ID`
- Subsequent `deleteTask` removes the task

---

## Backend: Delete Flow

### `DELETE /api/tasks/:id`

No changes. Deleting a recurring task deletes only that task. If a next occurrence was generated, it remains in `BACKLOG_COLUMN_ID` or `TODAY_COLUMN_ID`.

---

## Frontend: Task Drawer — Recurrence Section

### State

```ts
const [recurrence, setRecurrence] = useState<RecurrenceConfig | undefined>()
const [recurrenceError, setRecurrenceError] = useState('')
```

### Client-side Validation (mirrors backend)

```ts
useEffect(() => {
  if (!recurrence) { setRecurrenceError(''); return }
  const hasDoDate = doDate.length > 0
  const hasDueDate = dueDate.length > 0
  if (!hasDoDate && !hasDueDate) {
    setRecurrenceError('Recurring tasks must have at least a do date or due date.')
  } else if (recurrence.kind === 'interval_days' && (!recurrence.intervalDays || recurrence.intervalDays < 1)) {
    setRecurrenceError('Interval must be at least 1 day.')
  } else {
    setRecurrenceError('')
  }
}, [recurrence, doDate, dueDate])
```

### JSX — Recurrence Section (after Assignee section)

```tsx
<div className="task-drawer-field">
  <label>Repeat</label>
  <select
    value={recurrence?.kind ?? ''}
    onChange={e => {
      const kind = e.target.value as RecurrenceKind | ''
      if (!kind) { setRecurrence(undefined); return }
      setRecurrence({ kind, mode: 'fixed' })
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

### Save flow (update)

When saving an edit to a recurring task, pass `recurrence` in `UpdateTaskInput`. To clear recurrence, pass `recurrence: null`.

---

## Frontend: Delete Flow — Inline Recurrence Choice

### `handleDelete` in TaskDrawer

```ts
async function handleDelete() {
  if (!task) return

  if (task.recurrence) {
    const deleteAll = !window.confirm(
      'Delete this recurring task?\n\nOK = Delete this occurrence only\nCancel = Delete all future occurrences'
    )
    if (deleteAll) {
      // Suppress next occurrence, then delete
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

**Behavior**:
- **OK (delete this only)**: Deletes the task. If the completion flow generates a next occurrence, it appears in backlog (because we did not suppress).
- **Cancel (delete all)**: PATCH with `suppressNextOccurrence: true` + `columnId: DONE_COLUMN_ID` (completes the task without generating next), then `DELETE`. No next occurrence is created.

---

## Integration with Existing Behavior

### Reconciliation
Existing `reconcileBoard` still applies. New recurring occurrences created in `BACKLOG_COLUMN_ID` are automatically promoted to `TODAY_COLUMN_ID` if their `doDate`/`dueDate` qualifies.

### Done / Undone
Existing done-column auto-`completedAt` logic is unchanged. Moving a task into Done sets `completedAt`; moving it out clears it. The recurrence completion flow builds on this.

---

## Idempotency

- If `completedAt` already set, `updateTask` completion flow does nothing extra
- Before creating next occurrence: check `board.tasks.some(t => t.previousOccurrenceId === task.id)` — if exists, skip creation

---

## Testing Requirements

- Unit tests for `computeNextDate` covering all `RecurrenceKind` values
- Unit tests for completion flow (idempotency, next occurrence creation, chain linkage)
- Unit tests for `suppressNextOccurrence`
- Unit tests for validation rules
- Client-side: recurrence section renders correctly, validation messages display

---

## Files to Modify

| File | Change |
|------|--------|
| `server/src/types.ts` | Add `RecurrenceKind`, `RecurrenceMode`, `RecurrenceConfig`, `recurrence*` fields to `Task`, update input types |
| `client/src/types.ts` | Same as above |
| `server/src/store/recurrence.ts` | **New** — date computation |
| `server/src/store/boardStore.ts` | Completion flow, `suppressNextOccurrence` handling, input type update |
| `server/src/routes/tasks.ts` | Validation for recurrence fields, cron validation |
| `server/src/__tests__/tasks.test.ts` | Tests for recurrence validation and completion |
| `client/src/api.ts` | `suppressNextOccurrence` in updateTask options (type-only change) |
| `client/src/components/TaskDrawer.tsx` | Recurrence form section, delete flow |
| `client/src/__tests__/TaskDrawer.test.tsx` | Tests for recurrence UI |
