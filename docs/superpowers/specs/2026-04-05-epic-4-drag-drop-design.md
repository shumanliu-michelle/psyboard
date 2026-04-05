# EPIC 4: Drag & Drop — Column Reorder Design

## Status

Most of Epic 4 (task drag-and-drop) was implemented in prior work. This spec covers only the remaining piece: **column drag-and-drop UI**.

## What Already Exists

- Task DnD between columns (with Today-required restrictions)
- Blocked drag UX (date edit drawer)
- Backend `POST /columns/reorder` API
- `column.position` field
- `reorderColumns()` in boardStore
- `manualOrder` field on tasks

## Remaining Work

**Column drag-and-drop UI** — Allow users to drag columns to reorder them.

---

## Design

### Approach: Separate DndContext for Columns

Use a dedicated `DndContext` wrapping the column list, separate from the task DnD context. This avoids conflicts between column-sortable and task-sortable contexts.

### API Addition

**`client/src/api.ts`** — Add `reorderColumns` method:

```typescript
reorderColumns: (columnIds: string[]) =>
  request('/columns/reorder', { method: 'POST', body: JSON.stringify({ columnIds }) }),
```

### Component Changes

#### `ColumnCard.tsx`

- Wrap the column header in `useSortable({ id: column.id, data: { type: 'column' } })`
- Add `data-column-dragging` attribute when `isDragging`
- Pass `transform` and `transition` to the header element's style

#### `BoardView.tsx`

- Add a second `DndContext` wrapping the column list
- Use `PointerSensor` with distance 5 activation
- Handle `handleColumnDragStart` and `handleColumnDragEnd`
- On `onDragEnd`:
  - Compute new column order from `active.id` and `over.id`
  - Call `api.reorderColumns(newColumnIds)`
  - Call `onRefresh()`
- Add `ColumnDragOverlay` for the column drag ghost

### Drag Behavior

- **All columns draggable** — system and custom alike
- **Any drop position valid** — columns can be dropped anywhere in the order
- **No restrictions** — unlike tasks, columns have no reconciliation or date-based constraints
- **Drop on empty column area** — treated as drop at end of column list

### Persistence

Column order persisted via `POST /columns/reorder` → `boardStore.reorderColumns()` → writes `board.json` with updated `position` values.

---

## Files to Change

| File | Change |
|------|--------|
| `client/src/api.ts` | Add `reorderColumns()` method |
| `client/src/components/ColumnCard.tsx` | Add `useSortable` to column header |
| `client/src/components/BoardView.tsx` | Add column DnD context and handlers |

## No Changes Needed

- Server-side code (already done)
- Task DnD logic (already done)
- Reconciliation (already done)
