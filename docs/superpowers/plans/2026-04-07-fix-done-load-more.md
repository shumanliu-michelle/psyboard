# Fix Done Column "Load More" Button

## Bug Summary

The "Show older tasks" button never appears in the Done column because `olderDoneTasksCount` (computed from `allDoneTasks`) always equals 0 — `tasks` passed to `ColumnCard` is already filtered to the last 7 days by the server.

## Root Cause

```
tasks prop (from board state) → allDoneTasks → olderDoneTasksCount
                                     ↑
                    Only contains last 7 days of done tasks
                    (filtered by /api/board server-side)
```

Line 78: `const olderDoneTasksCount = isDoneColumn ? Math.max(0, allDoneTasks.length - visibleDoneTasks.length) : 0`
→ Always 0 since `allDoneTasks.length === visibleDoneTasks.length` (no tasks beyond 7-day window in `tasks`)

Line 273 condition: `donePage === 0 ? olderDoneTasksCount > 0 : ...`
→ Never true at page 0 → button never shows

## Fix

### File: `client/src/components/ColumnCard.tsx`

**Line 273** — Change the button visibility condition:

Before:
```tsx
{isDoneColumn && (donePage === 0 ? olderDoneTasksCount > 0 : olderDoneTasks.length > 0 || doneHasMore) && (
```

After:
```tsx
{isDoneColumn && (donePage === 0
    ? tasks.filter(t => t.columnId === 'col-done').length > 0  // show if Done has tasks
    : olderDoneTasks.length > 0 || doneHasMore) && (
```

**Lines 279-282** — Update footer text:

Before:
```tsx
{donePage === 0
  ? `Showing last ${DONE_PAGE_DAYS} days · ${olderDoneTasksCount} older`
  : `${olderDoneTasks.length} loaded · ${doneHasMore ? 'more available' : 'no older tasks'}`}
```

After:
```tsx
{donePage === 0
  ? `Showing last ${DONE_PAGE_DAYS} days`
  : `${olderDoneTasks.length} loaded · ${doneHasMore ? 'more available' : 'no older tasks'}`}
```

`olderDoneTasksCount` text is removed since it was always 0 and meaningless.

### Changes Summary

1. Button at page 0 shows whenever Done column has any tasks (regardless of count)
2. Button text at page 0 becomes "Show older tasks"
3. Footer text removes the misleading "X older" count at page 0
4. No server changes needed — the `/api/tasks?completedAt=lt:...` pagination is already wired via `handleLoadOlderDone`