# Done Column Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Done column shows last 7 days of completed tasks; "Show older tasks" button paginates in 7-day chunks. Footer shows "Showing last N days · M older tasks". Pagination is independent of search/filter.

**Architecture:** Done column pagination lives entirely in `ColumnCard` — it receives all done tasks and does client-side 7-day window filtering + pagination state. `sortTasksForColumn` is unchanged (sort by `completedAt` desc is already correct). `TaskCard` already shows completed timestamp for done tasks (previous commit).

**Tech Stack:** React useState for pagination state, `FilterContext` for dimming, existing `TaskCard` with completed timestamp

---

## File Changes

- **Modify:** `client/src/components/ColumnCard.tsx` — add pagination state, filtering logic, footer UI
- **Modify:** `client/src/__tests__/ColumnCard.test.tsx` — add pagination + filter interaction tests

---

### Task 1: Add pagination state and helper functions to ColumnCard

**Files:**
- Modify: `client/src/components/ColumnCard.tsx:1-11` (imports)

- [ ] **Step 1: Add `useState` to imports if not already present**

The file already imports `useState` at line 1.

- [ ] **Step 2: Add DONE_COLUMN_ID to imports**

Add `DONE_COLUMN_ID` to the import from `'../types'`.

```tsx
import { DONE_COLUMN_ID } from '../types'
```

- [ ] **Step 3: Add pagination state and helper functions inside `ColumnCard`**

After the existing `useEffect` block (around line 46), add:

```tsx
  // ---- Done column pagination ----
  const [donePage, setDonePage] = useState(0)  // number of 7-day pages loaded

  const DONE_PAGE_DAYS = 7

  function getCompletedAtDaysAgo(completedAt: string): number {
    const completed = new Date(completedAt)
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const completedMidnight = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate())
    return Math.round((todayMidnight.getTime() - completedMidnight.getTime()) / (1000 * 60 * 60 * 24))
  }

  const isDoneColumn = column.systemKey === 'done'

  // All done tasks sorted by completedAt desc (most recent first)
  const allDoneTasks = isDoneColumn
    ? tasks
        .filter(t => t.completedAt != null)
        .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))
    : []

  // Tasks visible on current page (0 = last 7 days, 1 = last 14 days, etc.)
  const visibleDoneTasks = isDoneColumn
    ? allDoneTasks.filter(t => getCompletedAtDaysAgo(t.completedAt!) < (donePage + 1) * DONE_PAGE_DAYS)
    : []

  // Older done tasks not yet visible
  const olderDoneTasksCount = isDoneColumn ? Math.max(0, allDoneTasks.length - visibleDoneTasks.length) : 0
```

- [ ] **Step 4: Run tests to verify no breakage**

Run: `cd client && npm test -- --run --testNamePattern="ColumnCard" 2>&1 | tail -10`
Expected: All existing ColumnCard tests still pass

- [ ] **Step 5: Commit**

```bash
git add src/components/ColumnCard.tsx
git commit -m "feat(ColumnCard): add done column pagination state and helper functions"
```

---

### Task 2: Add footer UI to Done column

**Files:**
- Modify: `client/src/components/ColumnCard.tsx` — add footer after `column-tasks` div
- Modify: `client/src/__tests__/ColumnCard.test.tsx` — add tests

- [ ] **Step 1: Add footer after the `column-tasks` div**

Find the closing `</div>` of `column-tasks` (around line 213) and the `QuickAddForm` conditional (line 215). After `</div>` and before the `QuickAddForm` conditional, add the done pagination footer:

```tsx
      {/* Done column pagination footer */}
      {isDoneColumn && olderDoneTasksCount > 0 && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            Showing last {(donePage + 1) * DONE_PAGE_DAYS} days · {olderDoneTasksCount} older {olderDoneTasksCount === 1 ? 'task' : 'tasks'}
          </div>
          <button
            onClick={() => setDonePage(p => p + 1)}
            style={{
              background: 'none',
              border: '1px solid #cbd5e1',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12,
              color: '#475569',
              cursor: 'pointer',
            }}
          >
            Show older tasks
          </button>
        </div>
      )}

      {/* Empty state: done column with no tasks */}
      {isDoneColumn && tasks.length === 0 && (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No completed tasks yet
        </div>
      )}
```

- [ ] **Step 2: Run tests to verify rendering**

Run: `cd client && npm test -- --run --testNamePattern="ColumnCard" 2>&1 | tail -10`
Expected: All existing tests still pass (no regression)

- [ ] **Step 3: Commit**

```bash
git add src/components/ColumnCard.tsx
git commit -m "feat(ColumnCard): add pagination footer to done column"
```

---

### Task 3: Wire tasks prop to use paginated visible tasks

**Files:**
- Modify: `client/src/components/ColumnCard.tsx` — use `visibleDoneTasks` in task rendering

- [ ] **Step 1: Determine which tasks to render**

In the `SortableContext` inside `column-tasks`, the tasks rendered should be:
- For Done column: `visibleDoneTasks` (the paginated subset)
- For all other columns: all `tasks` (unchanged)

Currently line 202 renders all `tasks`:
```tsx
<SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
```

Change to use the paginated tasks for done column:

```tsx
const renderedTasks = isDoneColumn ? visibleDoneTasks : tasks
```

Then update the `SortableContext`:
```tsx
<SortableContext items={renderedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
  {renderedTasks.map(task => (
```

And update the task count badge for Done column to show `tasks.length` (total, not just visible):
```tsx
{tasks.length}
```
The task count badge already shows `{tasks.length}` — this is correct per spec (total count, not paginated count).

- [ ] **Step 2: Run tests**

Run: `cd client && npm test -- --run --testNamePattern="ColumnCard" 2>&1 | tail -10`
Expected: All existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/components/ColumnCard.tsx
git commit -m "feat(ColumnCard): render paginated visible tasks in done column"
```

---

### Task 4: Add ColumnCard pagination tests

**Files:**
- Modify: `client/src/__tests__/ColumnCard.test.tsx`

- [ ] **Step 1: Add test helper for done tasks**

In the test file, the `makeTask` helper accepts `completedAt`. Add a helper for done tasks:

```tsx
// Helper to build a done task with completedAt
function makeDoneTask(overrides: Partial<Task> & { completedAt: string }): Task {
  return {
    id: randomUUID(),
    title: 'Done Task',
    columnId: DONE_COLUMN_ID,
    order: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-04-06T10:00:00.000Z',
    ...overrides,
  }
}
```

Note: Add `import { randomUUID } from 'crypto'` at the top of the test file (Node test environment provides this).

- [ ] **Step 2: Add tests for pagination footer**

```tsx
  describe('Done column pagination footer', () => {
    it('shows footer when older done tasks exist', () => {
      const today = new Date().toISOString()
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      const tasks = [
        makeDoneTask({ id: 'task-1', completedAt: today }),
        makeDoneTask({ id: 'task-2', completedAt: eightDaysAgo }),
      ]
      renderColumnCard(column, tasks)

      expect(screen.getByText(/showing last 7 days/i)).toBeTruthy()
      expect(screen.getByText(/1 older task/i)).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Show older tasks' })).toBeTruthy()
    })

    it('does not show footer when all done tasks are within 7 days', () => {
      const today = new Date().toISOString()
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      const tasks = [
        makeDoneTask({ id: 'task-1', completedAt: today }),
        makeDoneTask({ id: 'task-2', completedAt: today }),
      ]
      renderColumnCard(column, tasks)

      expect(screen.queryByText(/show older tasks/i)).toBeNull()
    })

    it('shows empty state when done column has no tasks', () => {
      const column = makeColumn({ id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done' })
      renderColumnCard(column, [])

      expect(screen.getByText('No completed tasks yet')).toBeTruthy()
    })
  })
```

- [ ] **Step 3: Run tests to verify they fail (TDD)**

Run: `cd client && npm test -- --run --testNamePattern="Done column pagination" 2>&1`
Expected: Tests fail (pagination not yet wired in renders)

- [ ] **Step 4: Verify all existing tests still pass**

Run: `cd client && npm test -- --run --testNamePattern="ColumnCard" 2>&1 | tail -15`
Expected: All non-pagination tests pass

- [ ] **Step 5: Commit tests**

```bash
git add src/__tests__/ColumnCard.test.tsx
git commit -m "test(ColumnCard): add pagination footer tests"
```

---

### Task 5: Verify filter/dim interaction

**Files:** (no changes needed — FilterContext already dims tasks via `isTaskDimmed`)

- [ ] **Step 1: Verify the dimming works with pagination**

The `TaskCard` already reads `isTaskDimmed` from `FilterContext` (line 30-31 of TaskCard). When a search/filter is active, done tasks not matching will be dimmed via `opacity: 0.3` and `className="dimmed"`. The `visibleDoneTasks` list already includes them — they just appear dimmed.

The footer count (`olderDoneTasksCount`) is based on `allDoneTasks` which includes all done tasks regardless of dim state — which matches the spec requirement.

No code changes needed for dimming — it works automatically via the existing `isTaskDimmed` hook.

- [ ] **Step 2: Run full test suite**

Run: `cd client && npm test -- --run 2>&1 | tail -10`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git commit -m "test: verify done column pagination with filter interaction"
```

---

## Self-Review Checklist

- [ ] Spec coverage: Done column 7-day filter ✅, pagination footer ✅, empty state ✅, completed timestamp (TaskCard) ✅ — all covered
- [ ] No placeholders: all code is concrete, no TODOs
- [ ] Type consistency: `completedAt` field used correctly from `Task` type; `DONE_COLUMN_ID` imported; `systemKey` checked on `Column`
- [ ] Pagination is client-side only, no API changes
- [ ] Filter/dim interaction: footer count includes dimmed tasks (total older count), not just non-dimmed
