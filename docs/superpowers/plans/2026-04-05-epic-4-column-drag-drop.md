# Column Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to drag and reorder columns on the board via a dedicated column DnD context.

**Architecture:** Add a second `DndContext` wrapping the column list in `BoardView.tsx`, separate from the existing task DnD context. Columns use `useSortable` in `ColumnCard`. New `api.reorderColumns()` method calls the existing `POST /columns/reorder` endpoint.

**Tech Stack:** React, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, Vitest

---

## File Map

| File | Responsibility |
|------|----------------|
| `client/src/api.ts` | Add `reorderColumns()` method |
| `client/src/components/ColumnCard.tsx` | Wrap column header in `useSortable` for column DnD |
| `client/src/components/BoardView.tsx` | Add column DnD context, handlers, and drag overlay |

---

## Tasks

### Task 1: Add `reorderColumns` to API client

**Files:**
- Modify: `client/src/api.ts`

- [ ] **Step 1: Add `reorderColumns` method to api object**

Find the closing brace of the `api` object (line 38) and add before it:

```typescript
reorderColumns: (columnIds: string[]) =>
  request('/columns/reorder', { method: 'POST', body: JSON.stringify({ columnIds }) }),
```

- [ ] **Step 2: Verify the method is typed correctly**

The `request` function returns `Promise<T>`. `POST /columns/reorder` returns `{ columns: Column[] }` (per `columns.ts:109`). The method should return `Promise<{ columns: Column[] }>`.

After adding, confirm the api.ts file looks like:

```typescript
export const api = {
  getBoard: () => request<Board>('/board'),
  createColumn: (data: CreateColumnInput) =>
    request<Column>('/columns', { method: 'POST', body: JSON.stringify(data) }),
  deleteColumn: (id: string) =>
    request<void>(`/columns/${id}`, { method: 'DELETE' }),
  updateColumn: (id: string, updates: { title?: string; position?: number }) =>
    request<Column>(`/columns/${id}`, { method: 'PATCH', body: JSON.stringify(updates) }),
  createTask: (data: CreateTaskInput) =>
    request<import('./types').Task>('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id: string, data: UpdateTaskInput) =>
    request<import('./types').Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTask: (id: string) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE' }),
  reorderColumns: (columnIds: string[]) =>
    request<{ columns: Column[] }>('/columns/reorder', { method: 'POST', body: JSON.stringify({ columnIds }) }),
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/api.ts
git commit -m "feat(client): add reorderColumns API method"
```

---

### Task 2: Add `useSortable` to ColumnCard for column dragging

**Files:**
- Modify: `client/src/components/ColumnCard.tsx`

- [ ] **Step 1: Import `useSortable` and `CSS` utilities**

At the top of the file, update the import from `@dnd-kit/sortable`:

```typescript
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
```

- [ ] **Step 2: Add sortable props to ColumnCard for column mode**

The `ColumnCard` component already receives `column: Column`. We need to make the column header sortable when the column itself is being dragged (not individual tasks within it).

Add inside the `ColumnCard` component function, before the `useDroppable` call:

```typescript
const {
  attributes: columnAttributes,
  listeners: columnListeners,
  setNodeRef: setColumnRef,
  transform: columnTransform,
  transition: columnTransition,
  isDragging: isColumnDragging,
} = useSortable({ id: column.id, data: { type: 'column' } })
```

- [ ] **Step 3: Apply transform styles to the column root element**

On the root `<div className="column">` element, add:

```typescript
style={{
  background: isOver ? '#dde' : undefined,
  transform: CSS.Transform.toString(columnTransform),
  transition: columnTransition,
  opacity: isColumnDragging ? 0.5 : 1,
}}
```

- [ ] **Step 4: Pass drag listeners to the column header drag area**

The column header already has the title and menu. Add `columnListeners` to the outer div of the custom column header (the `div` with `ref={menuRef}`). This gives the whole header area as a drag handle.

For the custom column header div:
```typescript
<div className="column-header" ref={menuRef} style={{ position: 'relative' }} {...columnAttributes} {...columnListeners}>
```

For the system column header div (the one with just `<h3>{column.title}</h3>`):
```typescript
<div className="column-header" {...columnAttributes} {...columnListeners}>
```

- [ ] **Step 5: Add `useDroppable` AFTER `useSortable` in the same component**

The `setNodeRef` for droppable must be different from sortable's `setColumnRef`. Keep the existing `useDroppable` call as-is (it's for tasks dropping into the column), but rename the ref to avoid conflict:

```typescript
const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: column.id })
```

And update the column-tasks div:
```typescript
<div ref={setDroppableRef} className="column-tasks">
```

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ColumnCard.tsx
git commit -m "feat(client): add useSortable to ColumnCard for column drag-and-drop"
```

---

### Task 3: Add column DnD context to BoardView

**Files:**
- Modify: `client/src/components/BoardView.tsx`

- [ ] **Step 1: Import `DragOverlay` and column-specific sensors**

Update the import from `@dnd-kit/core`:

```typescript
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
```

Add `SortableContext, horizontalSortingStrategy` from `@dnd-kit/sortable`:

```typescript
import { SortableContext, verticalListSortingStrategy, horizontalSortingStrategy } from '@dnd-kit/sortable'
```

- [ ] **Step 2: Add column DnD state and handlers**

Add these after the existing `activeTask` state (around line 63):

```typescript
const [activeColumn, setActiveColumn] = useState<Column | null>(null)
```

Add column sensors after the existing sensors definition (around line 93):

```typescript
const columnSensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
)
```

Add column drag handlers after `handleDragStart` (around line 99):

```typescript
function handleColumnDragStart(event: DragStartEvent) {
  document.body.style.overflow = 'hidden'
  const column = board.columns.find(c => c.id === event.active.id)
  if (column) setActiveColumn(column)
}

function handleColumnDragEnd(event: DragEndEvent) {
  document.body.style.overflow = 'auto'
  const { active, over } = event
  setActiveColumn(null)

  if (!over || active.id === over.id) return

  const oldIndex = board.columns.findIndex(c => c.id === active.id)
  const newIndex = board.columns.findIndex(c => c.id === over.id)

  if (oldIndex === -1 || newIndex === -1) return

  // Build new ordered columnIds array
  const columnIds = board.columns.map(c => c.id)
  columnIds.splice(oldIndex, 1)
  columnIds.splice(newIndex, 0, active.id as string)

  api.reorderColumns(columnIds).then(onRefresh).catch(console.error)
}
```

- [ ] **Step 3: Add column DnD context wrapping the column list**

Find the board div (around line 220) and wrap the columns map with a `DndContext`:

```typescript
<div className="board">
  <DndContext
    sensors={columnSensors}
    collisionDetection={closestCenter}
    onDragStart={handleColumnDragStart}
    onDragEnd={handleColumnDragEnd}
  >
    <SortableContext
      items={board.columns.slice().sort((a, b) => a.position - b.position).map(c => c.id)}
      strategy={horizontalSortingStrategy}
    >
      {board.columns
        .slice()
        .sort((a, b) => a.position - b.position)
        .map(column => {
          const columnTasks = sortTasksForColumn(
            board.tasks.filter(t => t.columnId === column.id),
            column.id,
            column.kind,
            column.systemKey
          )
          return (
            <ColumnCard
              key={column.id}
              column={column}
              tasks={columnTasks}
              onRefresh={onRefresh}
              onOpenDrawer={(task, initialTitle) => {
                if (task) openDrawerForEdit(task)
                else openDrawerForCreate(column.id, initialTitle)
              }}
            />
          )
        })}
    </SortableContext>

    <DragOverlay>
      {activeColumn ? (
        <div className="column" style={{
          opacity: 0.9,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          touchAction: 'none',
          minWidth: 240,
        }}>
          <div className="column-header">
            <h3>{activeColumn.title}</h3>
          </div>
        </div>
      ) : null}
    </DragOverlay>
  </DndContext>
```

- [ ] **Step 4: Verify imports for Column type**

Confirm `Column` type is imported in `BoardView.tsx`. It should be in the existing `import type { Board, Task } from '../types'`. Add `Column` to that import:

```typescript
import type { Board, Column, Task } from '../types'
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/BoardView.tsx
git commit -m "feat(client): add column drag-and-drop context to BoardView"
```

---

## Verification

After all tasks, run the client tests:

```bash
cd /Users/shumanliu/Projects/psyboard/client && npm test
```

Expected: all existing tests pass.

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| Column draggable for reordering | Task 3 |
| All columns (system + custom) draggable | Task 3 (both system and custom headers get listeners) |
| Persist column order after drag | Task 3 (`api.reorderColumns`) |
| No restrictions on column drag | Task 3 (no blocking logic) |
