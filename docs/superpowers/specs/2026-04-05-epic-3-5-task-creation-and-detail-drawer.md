# Epic 3+5: Task Creation & Detail Drawer — Design Spec

**Date:** 2026-04-05
**Status:** Approved

## Summary

Combine Epic 3 (Task Creation UX) and Epic 5 (Task Detail / Edit UX) into one feature: a right-side task drawer that handles both task creation (with a quick-add shortcut) and task editing. One shared component, consistent validation, no duplication.

---

## Quick Add (Epic 3)

### Location
Quick add form appears at the bottom of each column, below the task list.

### Availability
- **Enabled in:** Backlog, Today, Custom columns
- **Disabled in:** Done (no task creation directly into Done)

### Form Layout
```
┌─────────────────────────────────────┐
│ [title input field]                │
│                                     │
│ [Add]          [More fields]       │
└─────────────────────────────────────┘
```
- **Add** button: creates the task immediately
- **More fields** button: opens the full Task Drawer, pre-filled with the typed title
- No +Date, +Priority, or other chips — keep it minimal for fast entry

### Behavior
- Press **Enter** → same as clicking Add
- After Add: input clears, focus stays in the form for consecutive fast entry
- If title is empty, Add is disabled

### Autofill by Column

| Column | Prefills |
|--------|----------|
| Backlog | `columnId = col-backlog`, no dates |
| Today | `columnId = col-today`, `doDate = today` |
| Custom | `columnId = custom column id`, no dates |

### Validation
- Title is required (Add disabled if empty)
- Date validation (dueDate >= doDate) deferred to drawer if "More fields" is used

### Empty State
If the column has no tasks, the quick add form still appears at the bottom.

---

## Task Drawer (Epic 3 + Epic 5)

### UI Container
- Right-side drawer, slides in from the right
- Board remains visible and scrollable behind the drawer (blurred/dimmed)
- Drawer width: fixed ~380px on desktop
- Close: click X button, click outside the drawer, or press Escape

### Entry Points

| Trigger | Opens drawer in |
|---------|-----------------|
| Click task card | Edit mode, pre-filled with task data |
| Click "More fields" in quick add | Create mode, pre-filled with quick-add title |
| Click "+ Add task" button (column header) | Create mode, empty |

### Header
- Shows "New task" in create mode, task title in edit mode
- X close button on the right

### Form Fields (all fields, create + edit)

| Field | Input Type | Notes |
|-------|-----------|-------|
| Title | text input | Required |
| Notes | textarea | Optional |
| Do date | date picker | Optional |
| Due date | date picker | Optional |
| Priority | Low / Medium / High buttons | Optional |
| Assignee | SL / KL / Unassigned buttons | Optional |

### Priority Selector
Three toggle buttons: **Low**, **Med**, **High**
- One active at a time; clicking active one de-selects (resets to no priority)

### Assignee Selector
Three buttons: **SL**, **KL**, **Unassigned**
- One can be selected at a time

### Validation

| Rule | Behavior |
|------|----------|
| Title empty | Save disabled |
| dueDate and doDate both present | dueDate >= doDate enforced |
| Message | "Due date cannot be earlier than do date." |

### Save Model
- **Explicit Save** — no autosave
- **Cancel** — discards all changes, closes drawer
- On Save: API call to backend, reconciliation runs, drawer stays open on success

### Post-Save Behavior
- After Save: keep drawer open, board refreshes with updated task
- If reconciliation moved the task (e.g., task promoted to Today), the board reflects the new position

### Actions in Drawer

**Mark done** — text button, below the form:
- Moves task to Done: `columnId = col-done`, `completedAt = now`
- Available in edit mode only (not in create mode)
- After Mark done: drawer closes

**Delete task** — text button, below the form:
- Available in edit mode only
- Shows confirmation: "Delete this task? This action cannot be undone."
- On confirm: API delete, board refreshes, drawer closes

---

## Implementation Components

### TaskDrawer Component
A single component that handles both create and edit modes.

Props:
```ts
type DrawerMode = 'create' | 'edit'

interface TaskDrawerProps {
  mode: DrawerMode
  taskId?: string           // required in edit mode
  initialTitle?: string      // pre-filled from quick add
  onClose: () => void
  onSaved: () => void       // refresh board
}
```

### QuickAddForm Component
Inline at bottom of each column.

Props:
```ts
interface QuickAddFormProps {
  columnId: string
  onExpandToDrawer: (title: string) => void  // opens drawer with title pre-filled
}
```

### ColumnCard Update
Each ColumnCard renders a QuickAddForm at the bottom (except Done column).

---

## Interaction Map

```
Column "+ Add task" button → Drawer (create, empty)
Quick Add → [Enter] → Task created, input cleared
Quick Add → [More fields] → Drawer (create, title pre-filled)
Task card click → Drawer (edit, task data pre-filled)
Drawer → [Save] → API update/create, board refresh, drawer stays open
Drawer → [Cancel] → Discard changes, drawer closes
Drawer → [Mark done] → API update (col-done), board refresh, drawer closes
Drawer → [Delete] → Confirm dialog → API delete, board refresh, drawer closes
Escape / X / outside click → Drawer closes (discard if unsaved)
```

---

## Non-Goals (v1)
- Autosave
- Column selector in drawer
- Subtasks
- Tags
- "Edit all future" for recurring tasks (Epic 7)
- Unsaved changes warning on close

---

## Out of Scope for Epic 3+5
- Recurring task configuration (Epic 7)
- Date display on TaskCard (Epic 3 UI — dates shown on card, not in this spec)
- Drag restrictions based on dates
- Overdue visual styling

---

## API Changes

No new API endpoints needed. The drawer uses the existing:
- `POST /api/tasks` for quick add and drawer create
- `PATCH /api/tasks/:id` for drawer save, mark done, delete
- `DELETE /api/tasks/:id` for delete

Reconciliation runs on the backend after create/update (already implemented in Epic 2).
