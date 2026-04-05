# Psyboard UI Redesign — C1 Indigo & Amber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain gray prototype UI with the C1 Indigo & Amber design — white cards on slate background, color-coded column headers, tinted card shadows.

**Architecture:** Client-side CSS redesign. A `columnColors.ts` utility maps `systemKey` to accent colors. Components use CSS class names and inline styles to apply the design. No server changes required.

**Tech Stack:** CSS (index.css), React (existing components), no new dependencies.

---

## File Map

| File | Responsibility |
|---|---|
| `client/src/styles/columnColors.ts` | **New** — maps systemKey → hex color, shadow tint |
| `client/src/index.css` | Board bg, column bg/radius/shadow, card styles, drawer styles, input styles |
| `client/src/components/ColumnCard.tsx` | Colored dot + header name, column container border-top |
| `client/src/components/TaskCard.tsx` | Priority left-border color, assignee circle colors |
| `client/src/components/TaskDrawer.tsx` | Drawer button color updates (save=indigo, etc.) |

---

## Task 1: Create columnColors.ts utility

**Files:**
- Create: `client/src/styles/columnColors.ts`

- [ ] **Step 1: Write the utility**

```typescript
// Maps column systemKey to its accent color and shadow tint
export const COLUMN_COLORS: Record<string, { accent: string; bg: string; shadow: string }> = {
  backlog: { accent: '#6366f1', bg: '#eef2ff', shadow: 'rgba(99,102,241,0.10)' },
  today:   { accent: '#f59e0b', bg: '#fffbeb', shadow: 'rgba(245,158,11,0.10)' },
  done:    { accent: '#22c55e', bg: '#f0fdf4', shadow: 'rgba(34,197,94,0.10)' },
  thisweek: { accent: '#8b5cf6', bg: '#f5f3ff', shadow: 'rgba(139,92,246,0.10)' },
}

export const CUSTOM_COLUMN_COLOR = { accent: '#f97316', bg: '#fff7ed', shadow: 'rgba(249,115,22,0.10)' }

export function getColumnColor(systemKey?: string) {
  if (!systemKey) return CUSTOM_COLUMN_COLOR
  return COLUMN_COLORS[systemKey] ?? CUSTOM_COLUMN_COLOR
}
```

- [ ] **Step 2: Create the directory and file**

```bash
mkdir -p client/src/styles
```

Write the file at `client/src/styles/columnColors.ts` with the code above.

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/columnColors.ts
git commit -m "feat(ui): add columnColors utility mapping systemKey to accent colors"
```

---

## Task 2: Update index.css — board, columns, cards, drawer

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace the entire file**

Read the current `client/src/index.css` first. Then overwrite it completely with the new CSS below. This replaces the old gray prototype styles.

```css
/* === CSS Custom Properties — C1 Indigo & Amber === */
:root {
  --bg-board: #f8fafc;
  --bg-card: #ffffff;
  --accent-backlog: #6366f1;
  --accent-today: #f59e0b;
  --accent-done: #22c55e;
  --accent-appointment: #ec4899;
  --accent-shopping: #14b8a6;
  --accent-thisweek: #8b5cf6;
  --accent-custom: #f97316;
  --priority-high: #ef4444;
  --priority-medium: #f59e0b;
  --priority-low: #22c55e;
  --assignee-sl-bg: #eef2ff;
  --assignee-sl-text: #6366f1;
  --assignee-kl-bg: #dbeafe;
  --assignee-kl-text: #1e40af;
  --text-done: #9ca3af;
  --text-muted: #6b7280;
  --border-default: #d1d5db;
  --shadow-card: 0 2px 8px rgba(0,0,0,0.06);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg-board);
  min-height: 100vh;
}

#root {
  min-height: 100vh;
}

/* === Board === */
.board {
  display: flex;
  gap: 16px;
  padding: 24px;
  min-height: 100vh;
  align-items: flex-start;
  overflow-x: auto;
  overscroll-behavior: contain;
}

/* === Column === */
.column {
  background: var(--bg-card);
  border-radius: 12px;
  min-width: 280px;
  max-width: 320px;
  flex-shrink: 0;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}

.column-header {
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.column-header h3 {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-count {
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 500;
}

.column-tasks {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 100px;
}

/* === Task Card === */
.task-card {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: var(--shadow-card);
  cursor: grab;
  user-select: none;
  border-left: 3px solid transparent;
}

.task-card:active {
  cursor: grabbing;
}

.task-card-title {
  font-size: 13px;
  font-weight: 500;
  color: #111;
  word-break: break-word;
}

.task-card-title input {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
}

.task-description {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Dragging state */
.task-card.dragging {
  opacity: 0.5;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* DragOverlay */
[data-dnd-drag-overlay] {
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.task-card {
  user-select: none;
  -webkit-user-select: none;
}

/* === Add task / column forms === */
.add-task-btn {
  width: 100%;
  padding: 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  text-align: left;
}

.add-task-btn:hover {
  color: #374151;
}

.add-form {
  padding: 8px;
  background: #f9fafb;
  border-radius: 0 0 12px 12px;
}

.add-form input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  margin-bottom: 8px;
  background: white;
}

.add-form input:focus {
  outline: none;
  border-color: var(--accent-backlog);
}

.add-form-actions {
  display: flex;
  gap: 8px;
}

.add-form-actions button {
  flex: 1;
  padding: 6px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.add-form-actions .btn-primary {
  background: var(--accent-backlog);
  color: white;
}

.add-form-actions .btn-secondary {
  background: #e5e7eb;
  color: #374151;
}

/* === Add column === */
.add-column {
  min-width: 280px;
  max-width: 320px;
  flex-shrink: 0;
}

.add-column-btn {
  width: 100%;
  padding: 16px;
  border: 2px dashed var(--border-default);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
}

.add-column-btn:hover {
  border-color: var(--accent-backlog);
  color: var(--accent-backlog);
  background: var(--assignee-sl-bg);
}

/* === Column delete === */
.column-delete {
  background: none;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  font-size: 16px;
  padding: 2px 4px;
  border-radius: 4px;
}

.column-delete:hover {
  background: #f3f4f6;
  color: #6b7280;
}

/* === Task Drawer overlay === */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 50;
  display: flex;
  justify-content: flex-end;
}

.task-drawer {
  background: white;
  width: 380px;
  height: 100%;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.12);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.task-drawer-header {
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.task-drawer-header h2 {
  font-size: 14px;
  font-weight: 600;
  color: #111;
  margin: 0;
}

.task-drawer-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #9ca3af;
  padding: 2px 6px;
  line-height: 1;
  border-radius: 4px;
}

.task-drawer-close:hover {
  background: #f3f4f6;
  color: #374151;
}

.task-drawer-body {
  padding: 16px 18px;
  flex: 1;
  overflow-y: auto;
}

.task-drawer-field {
  margin-bottom: 14px;
}

.task-drawer-field label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
}

.task-drawer-field input[type="text"],
.task-drawer-field textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  background: white;
  color: #111;
}

.task-drawer-field textarea {
  min-height: 70px;
  resize: vertical;
}

.task-drawer-field input[type="date"] {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  box-sizing: border-box;
  background: white;
}

.task-drawer-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.task-drawer-btn-group {
  display: flex;
  gap: 6px;
}

.task-drawer-btn-group button {
  flex: 1;
  padding: 7px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: white;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-muted);
}

.task-drawer-btn-group button.selected {
  font-weight: 500;
}

.task-drawer-btn-group button.selected.priority-high,
.task-drawer-btn-group button.priority-high.selected {
  background: #fef2f2;
  border-color: var(--priority-high);
  color: var(--priority-high);
}

.task-drawer-btn-group button.priority-medium.selected {
  background: #fffbeb;
  border-color: var(--priority-medium);
  color: #b45309;
}

.task-drawer-btn-group button.priority-low.selected {
  background: #f0fdf4;
  border-color: var(--priority-low);
  color: #15803d;
}

.task-drawer-btn-group button.assignee-sl.selected {
  background: var(--assignee-sl-bg);
  border-color: var(--assignee-sl-text);
  color: var(--assignee-sl-text);
}

.task-drawer-btn-group button.assignee-kl.selected {
  background: var(--assignee-kl-bg);
  border-color: var(--assignee-kl-text);
  color: var(--assignee-kl-text);
}

.task-drawer-actions {
  padding: 14px 18px;
  border-top: 1px solid #e5e7eb;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.task-drawer-danger-zone {
  padding: 0 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn-danger-full {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid;
}

.btn-danger-full.btn-mark-done {
  background: #d1fae5;
  color: #065f46;
  border-color: #6ee7b7;
}

.btn-danger-full.btn-mark-done:hover {
  background: #a7f3d0;
}

.btn-danger-full.btn-delete {
  background: white;
  color: #dc2626;
  border-color: #fca5a5;
}

.btn-danger-full.btn-delete:hover {
  background: #fef2f2;
}

.btn-danger-full:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.task-drawer-actions .primary-actions {
  display: flex;
  gap: 10px;
}

.task-drawer-actions .btn-save {
  flex: 1;
  padding: 10px;
  background: var(--accent-backlog);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}

.task-drawer-actions .btn-save:disabled {
  background: #d1d5db;
  cursor: not-allowed;
}

.task-drawer-actions .btn-cancel {
  padding: 10px 16px;
  background: white;
  color: #374151;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}

.drawer-error {
  color: #dc2626;
  font-size: 12px;
  margin-top: 4px;
  margin-bottom: 8px;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "feat(ui): apply C1 Indigo & Amber CSS redesign"
```

---

## Task 3: Update ColumnCard.tsx — colored column headers + container border-top

**Files:**
- Modify: `client/src/components/ColumnCard.tsx:1-197`

- [ ] **Step 1: Add import and column color helper**

After the existing imports, add:

```tsx
import { getColumnColor, CUSTOM_COLUMN_COLOR } from '../styles/columnColors'
```

- [ ] **Step 2: Update the system column header section (lines ~162-172)**

Find the section that renders the system column header (the part with `{column.kind !== 'custom' ? (...) : ...}`). Replace the header rendering with colored dot + accent color for the column name and task count.

For **system columns** (kind === 'system'), the header should look like:

```tsx
<div className="column-header" style={{
  borderTop: `2px solid ${getColumnColor(column.systemKey).accent}`,
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <div style={{
      width: 7, height: 7, borderRadius: '50%',
      background: getColumnColor(column.systemKey).accent,
    }} />
    <h3 style={{ color: getColumnColor(column.systemKey).accent, flex: 1 }}>
      {column.title}
    </h3>
  </div>
  <span style={{
    background: getColumnColor(column.systemKey).bg,
    color: getColumnColor(column.systemKey).accent,
    borderRadius: 10,
    padding: '1px 7px',
    fontSize: 11,
    fontWeight: 500,
  }}>
    {tasks.length}
  </span>
</div>
```

For **custom columns**, use `CUSTOM_COLUMN_COLOR` instead of `getColumnColor(column.systemKey)`.

- [ ] **Step 3: Update the column container style**

Find the outer `div` with `className="column"`. Add an inline `style` that sets the `boxShadow` to use the column's tint:

```tsx
style={{
  background: isOver ? '#f9fafb' : undefined,
  transform: CSS.Transform.toString(columnTransform),
  transition: columnTransition,
  opacity: isColumnDragging ? 0.5 : 1,
  boxShadow: isOver
    ? undefined
    : `0 4px 16px ${getColumnColor(column.systemKey).shadow}`,
}}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ColumnCard.tsx
git commit -m "feat(ui): add colored column headers and tinted shadows"
```

---

## Task 4: Update TaskCard.tsx — priority borders + assignee circles

**Files:**
- Modify: `client/src/components/TaskCard.tsx:1-281`

- [ ] **Step 1: Update the priority border color logic**

Find the `priorityColor` variable (line ~100). It currently returns hex strings. Update the mapping to match the new palette:

```tsx
const priorityColor =
  task.priority === 'high'   ? '#ef4444' :
  task.priority === 'medium' ? '#f59e0b' :
  task.priority === 'low'    ? '#22c55e' :
  undefined
```

- [ ] **Step 2: Update the task card outer div to use `borderLeft`**

The task card div already has `borderLeft: task.priority ? ...`. Ensure it reads:

```tsx
<div
  ref={setNodeRef}
  style={{
    ...style,
    display: 'flex',
    flexDirection: 'row',
    borderLeft: task.priority ? `3px solid ${priorityColor}` : '3px solid transparent',
  }}
  className={`task-card${isDragging ? ' dragging' : ''}`}
  onClick={() => onOpenEdit()}
>
```

- [ ] **Step 3: Update assignee circle colors**

Find the assignee `<span>` (lines ~262-276). Replace its inline styles with:

```tsx
{task.assignee && (
  <span style={{
    background: task.assignee === 'SL' ? '#eef2ff' : '#dbeafe',
    color: task.assignee === 'SL' ? '#6366f1' : '#1e40af',
    borderRadius: '50%',
    width: 20,
    height: 20,
    fontSize: 10,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }}>
    {task.assignee}
  </span>
)}
```

Also update the description div to use class `task-description` instead of inline font styles.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/TaskCard.tsx
git commit -m "feat(ui): update priority borders and assignee avatar colors"
```

---

## Task 5: Update TaskDrawer.tsx — drawer button colors + label styling

**Files:**
- Modify: `client/src/components/TaskDrawer.tsx:1-309`

- [ ] **Step 1: Update task-drawer-header h2 font weight**

The h2 in the drawer header currently has `margin: 0` via CSS. Update the inline style:

```tsx
<h2 style={{ fontSize: 14, fontWeight: 600, color: '#111', margin: 0 }}>
  {mode === 'edit' && task ? task.title : 'New task'}
</h2>
```

- [ ] **Step 2: Update task-drawer-field label class usage**

No class changes needed — the CSS already styles `.task-drawer-field label` via the new index.css. Verify the labels use `className="task-drawer-field"` — they already do.

- [ ] **Step 3: Update priority button class names**

Update the priority buttons to include the appropriate class:

```tsx
<div className="task-drawer-btn-group">
  <button
    type="button"
    className={`priority-low${priority === 'low' ? ' selected' : ''}`}
    onClick={() => togglePriority('low')}
    disabled={isCompleted}
  >
    Low
  </button>
  <button
    type="button"
    className={`priority-medium${priority === 'medium' ? ' selected' : ''}`}
    onClick={() => togglePriority('medium')}
    disabled={isCompleted}
  >
    Med
  </button>
  <button
    type="button"
    className={`priority-high${priority === 'high' ? ' selected' : ''}`}
    onClick={() => togglePriority('high')}
    disabled={isCompleted}
  >
    High
  </button>
</div>
```

- [ ] **Step 4: Update assignee button class names**

```tsx
<div className="task-drawer-btn-group">
  <button
    type="button"
    className={`assignee-sl${assignee === 'SL' ? ' selected' : ''}`}
    onClick={() => toggleAssignee('SL')}
    disabled={isCompleted}
  >
    SL
  </button>
  <button
    type="button"
    className={`assignee-kl${assignee === 'KL' ? ' selected' : ''}`}
    onClick={() => toggleAssignee('KL')}
    disabled={isCompleted}
  >
    KL
  </button>
  <button
    type="button"
    className={assignee === undefined ? 'selected' : ''}
    onClick={() => setAssignee(undefined)}
    disabled={isCompleted}
  >
    None
  </button>
</div>
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/TaskDrawer.tsx
git commit -m "feat(ui): update drawer priority/assignee button selected states"
```

---

## Task 6: Manual visual verification

- [ ] **Step 1: Run the dev server**

```bash
cd client && npm run dev
```

- [ ] **Step 2: Open http://localhost:5173**

Verify:
- Board background is `#f8fafc` (light cool gray)
- Column containers are white with 12px radius and colored top border
- Column headers show colored dot + column name in accent color
- Task count badge uses column's tinted background
- Task cards have white bg, 8px radius, soft shadow
- Priority tasks show red/amber/green left border
- Assignee circles use indigo for SL, blue for KL
- Drawer Save button is indigo, Mark Done is green, Delete is red-outlined
- Completed tasks in Done column show strikethrough + muted color

- [ ] **Step 3: Test drag and drop still works**

- [ ] **Step 4: Test add task, edit task, drawer open/close**

---

## Self-Review Checklist

- [ ] Spec coverage: board bg ✓, column colors ✓, card shadows ✓, priority borders ✓, assignee colors ✓, drawer styles ✓
- [ ] No placeholders (all hex values, class names, file paths are concrete)
- [ ] Type consistency: `getColumnColor(systemKey?: string)` matches usage in ColumnCard
- [ ] All 5 files in file map are covered
- [ ] Each task has commit at the end
