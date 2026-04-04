# Design: Task Assignee + Icon Buttons

## Overview

Add assignee support to tasks (SL or KL) and refresh the TaskCard UI with icon-only action buttons (pencil for edit, cross for delete).

## Data Model

**`Task` type** — add `assignee?: 'SL' | 'KL'` to:
- `client/src/types.ts`
- `server/src/types.ts`

**`UpdateTaskInput`** — add `assignee?: 'SL' | 'KL' | null` to allow clearing the assignee.

No changes to `CreateTaskInput` — assignee is optional and defaults to undefined.

## UI Design

### Card Layout

```
┌─────────────────────────────────────┐
│ Task title here                 [✏️] [✕]
│
│ [SL]  or  [KL]                    ← only shown when assigned
└─────────────────────────────────────┘
```

### Action Buttons (top-right, always visible)
- **Edit**: pencil SVG icon, 14×14px, color `#888`, hover `#333`
- **Delete**: cross/X SVG icon, 14×14px, color `#888`, hover `#c00`
- Both `e.stopPropagation()` to prevent drag conflicts
- Gap between buttons: 4px

### Assignee Badge (below title)
- Shown only when `task.assignee` is set
- Chip style: small rounded pill, 6px vertical padding, 10px horizontal
- **SL**: background `#d1fae5` (green-100), text `#065f46` (green-800)
- **KL**: background `#dbeafe` (blue-100), text `#1e40af` (blue-800)
- Left-aligned below title

### Assign Popover
Trigger: small person/assign icon button on the card (to the left of edit/delete, or same row). When clicked, show a small floating menu with three options:
- "SL" (selectable)
- "KL" (selectable)
- "Unassigned" (clears assignee)

Selected option shows a checkmark.

### Edit Mode (inline, unchanged from current)
When editing title, the assignee badge stays visible below the input.

## Components

### `TaskCard.tsx`
- Refactor action buttons to use inline SVG icons
- Add assignee badge row
- Add assign popover (can reuse a small `<select>` or custom popover)
- Keep double-click on title to enter edit mode

### API / Server
- `PATCH /api/tasks/:id` already handles partial updates — `assignee` field passes through naturally
- No route changes needed

### Types
Both `client/src/types.ts` and `server/src/types.ts` need:
```typescript
export type Task = {
  // ...existing fields...
  assignee?: 'SL' | 'KL'
}
```

## Test Coverage

### E2E
- Can assign a task to SL
- Can assign a task to KL
- Can unassign a task
- Badge displays correctly for SL vs KL
- Badge hidden when unassigned

## Files to Change

| File | Change |
|------|--------|
| `client/src/types.ts` | Add `assignee?: 'SL' \| 'KL'` to Task |
| `server/src/types.ts` | Add `assignee?: 'SL' \| 'KL'` to Task |
| `client/src/components/TaskCard.tsx` | New icons, assignee badge, assign popover |
| `e2e/board.spec.ts` | Add assignee tests |

## Out of Scope

- Changing who can be assigned (always SL or KL, hardcoded)
- Assignee avatar images
- Assignee filtering or grouping
