# Done Column Pagination — Design Spec

## Context

As the Done column accumulates completed tasks, scrolling to find recent work becomes impractical. The Done column should only surface tasks completed in the last 7 days, with older tasks accessible via pagination.

## What We're Building

### Done Column — Last 7 Days

The Done column filters to show only tasks with `completedAt` within the last 7 days. Each visible task card shows:

- Title (with 🔄 for recurring tasks)
- Completed timestamp: "Completed [relative date] [time]"
  - Format matches due date style: `fontSize: 11`, `color: #94a3b8`, `marginTop: 2`
  - Relative date options: "Today", "Yesterday", or "MMM D" (e.g., "Apr 3")
  - Time in 12h format: "9:30 AM"
- Footer when older tasks exist: "Showing last 7 days · N older tasks" + "Show older tasks" button

### Show Older — Paginated

Clicking "Show older tasks" reveals the next oldest 7 days of completed tasks in the same Done column, appended below the current view. The footer updates to show total count and a "Show even older tasks" button.

- Each page = 7 days of done tasks
- No limit on total pages
- Footer shows cumulative count: "Showing tasks from last 14 days · 18 older tasks"
- Pagination state is independent of search/filter — paginating then searching keeps expanded pagination with non-matching tasks dimmed

### What Doesn't Change

- Due date is **not shown** on task cards in the Done column
- `board.json` is unchanged — no file restructuring
- All done tasks remain in `board.json`; only the UI filters/paginates
- Recurring tasks: the completed occurrence stays in Done with its own `completedAt`; the next occurrence appears in the appropriate column per reconciliation logic

## UI Details

### Completed Timestamp Format

```
Completed Today 2:15 PM
Completed Yesterday 9:30 AM
Completed Apr 3 6:00 PM
```

Uses the same font/color as due dates:
```jsx
<div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
  Completed {formatCompletedRelative(task.completedAt)} {formatCompletedTime(task.completedAt)}
</div>
```

### Footer (When Older Tasks Exist)

```
┌─────────────────────────────────┐
│  Showing last 7 days · 6 older │
│      [ Show older tasks ]       │
└─────────────────────────────────┘
```

After clicking:
```
┌─────────────────────────────────┐
│ Showing last 14 days · 18 older│
│    [ Show even older tasks ]    │
└─────────────────────────────────┘
```

### Empty State

If no tasks completed in the last 7 days, the Done column shows:
- No footer button
- The column appears empty with just the header

## Component Changes

### `TaskCard` (Done column variant)

- When `columnId === DONE_COLUMN_ID`:
  - Hide due date display
  - Show completed timestamp instead of due date
  - Completed time uses `completedAt` ISO string

### `ColumnCard` (Done column variant)

- When `column.systemKey === 'done'`:
  - Filter `tasks` prop to only tasks with `completedAt` within last 7 days (page 0)
  - Track `donePage` state (starts at 0)
  - If older tasks exist (`doneTasks.length > visibleTasks.length`), render footer
  - "Show older" appends next 7-day page to visible list
  - No pagination controls needed — just a single "show older" button that grows the list

### `sortTasksForColumn` (Done)

- Existing sort by `completedAt` descending (most recent first) is already correct
- Filtering by 7-day window happens in `ColumnCard`, not in the sort

## Implementation Notes

- Filtering is client-side only — `board.json` and API responses unchanged
- `completedAt` is already set when tasks move to Done (`updateTask` in `boardStore.ts`)
- "7 days" = calendar days, computed from today at midnight
- The `ColumnCard` receives all done tasks and does its own filtering/pagination locally
- No new API endpoints needed
- SSE (when implemented) doesn't affect this — board push still includes all done tasks; client filters

## Out of Scope

- Archiving done tasks to separate JSON files (v2)
- Server-side filtering/pagination
- Configurable 7-day window
- Search/filter within done tasks
