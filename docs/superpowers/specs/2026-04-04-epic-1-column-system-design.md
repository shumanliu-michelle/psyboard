# Epic 1: Column System — Design Spec

**Date:** 2026-04-04
**Status:** Approved

## Summary

Hybrid column system with 3 protected system columns (Backlog, Today, Done) and user-created custom columns. System columns are protected but reorderable. Custom columns are fully manageable.

---

## Data Model

### Column type

```ts
export type ColumnKind = 'system' | 'custom'

export type SystemKey = 'backlog' | 'today' | 'done'

export type Column = {
  id: string
  title: string
  kind: ColumnKind
  systemKey?: SystemKey  // only for kind === 'system'
  position: number       // replaces `order`, lower = more left
  createdAt: string
  updatedAt: string
}
```

### System column constants

```ts
export const BACKLOG_COLUMN_ID = 'col-backlog'
export const TODAY_COLUMN_ID  = 'col-today'
export const DONE_COLUMN_ID   = 'col-done'
```

### System columns on first load

The `board.json` is deleted and recreated with three system columns:

| id | title | kind | systemKey | position |
|---|---|---|---|---|
| col-backlog | Backlog | system | backlog | 0 |
| col-today | Today | system | today | 1 |
| col-done | Done | system | done | 2 |

---

## Backend Changes

### `boardStore.ts`

**`readBoard()` changes:**
- Validate loaded board has all 3 system columns with correct fixed IDs
- If any system column is missing, recreate it with default values, restore other columns
- If system column has wrong `kind` or `systemKey`, correct it
- Migrate existing `order` → `position` for all columns
- If no `kind`/`systemKey` fields exist (old data), add them based on title match:
  - "Backlog" → `kind: 'system', systemKey: 'backlog'`
  - "Today" → `kind: 'system', systemKey: 'today'`
  - "Done" → `kind: 'system', systemKey: 'done'`
  - Others → `kind: 'custom'`

**`createColumn(title)` changes:**
- Append to end of board
- Set `position = board.columns.length` (highest position = rightmost)
- Set `kind: 'custom'`
- Return the new column

**`deleteColumn(id)` changes:**
- Find the column first
- If `kind === 'system'`, return error `"Cannot delete system column"` (403)
- Move all tasks in this column to Backlog (`col-backlog`) before deleting
- Remove column from board
- Persist

**New `updateColumn(id, updates)` function:**
- `updates`: `{ title?: string; position?: number }`
- If `title` is provided and a custom column would be renamed to "Backlog", "Today", or "Done" → reject with 400
- If `position` is provided, reorder other columns to accommodate

**New `reorderColumns(columnIds: string[])` function:**
- `columnIds` is an array of all column IDs in desired order (including system columns)
- Updates `position` for each column based on its index in the array
- Persists

### `columns.ts` (Express routes)

- `POST /api/columns` — unchanged (creates custom column)
- `DELETE /api/columns/:id` — unchanged (but store now rejects system column deletion)
- `PATCH /api/columns/:id` — **new** — update title or position of a column
- `POST /api/columns/reorder` — **new** — reorder all columns at once

### Request/response shapes

```ts
// PATCH /api/columns/:id
// Request body: { title?: string; position?: number }
// Response: updated Column

// POST /api/columns/reorder
// Request body: { columnIds: string[] }  // all column IDs in desired order
// Response: { columns: Column[] }        // full updated column list
```

---

## Frontend Changes

### `types.ts` (client copy)

Update `Column` type to match server. Add constants.

### `BoardView.tsx`

- Render columns sorted by `position` ascending (not array index)
- Column cards show kebab/delete menu for **custom columns only**
- System columns show no delete option and cannot be renamed inline
- Add "Add column" button at end of board

### `ColumnCard.tsx`

**Custom column header UI:**
- Title text (display only — not editable inline on double-click for v1)
- Kebab menu button (⋮) anchored top-right of column header, matching TaskCard's kebab menu style
- Kebab menu dropdown contains:
  - **Rename** — opens inline edit mode for the title
  - **Delete** — shows confirmation dialog
- System columns: no kebab menu (protected, no actions available)

**Rename inline edit:**
- Single-click kebab → dropdown opens → click "Rename" to enter edit mode
- Title becomes an input field
- Enter to save, Escape to cancel
- API call: `PATCH /api/columns/:id` with `{ title }`
- Cannot rename to "Backlog", "Today", or "Done" (validation rejects)

**Delete confirmation dialog:**
- Modal text: "Delete column `{title}`? All tasks will be moved to Backlog."
- Actions: Cancel / Delete

**Kebab menu style consistency:**
- Dropdown matches TaskCard's dropdown: white background, `1px solid #e5e7eb` border, `6px` border-radius, `0 4px 12px rgba(0,0,0,0.1)` box-shadow
- Menu items: text buttons (no icons), `Assign`/`Edit`/`Delete` pattern — for columns: "Rename" and "Delete" in dark text (`#374151`), Delete in red (`#dc2626`)
- Click outside closes dropdown

**Add task button behavior:**
- Shown on ALL columns including Backlog and custom columns
- NOT shown on Done (per Epic 3 spec — task creation disabled in Done)

---

## Auto-Heal on Load

On every `readBoard()` call, the server validates and heals:

1. Ensure `col-backlog`, `col-today`, `col-done` exist with correct `kind: 'system'`
2. For each missing/corrupted system column, recreate with defaults
3. All custom columns are preserved
4. Tasks are NOT deleted — only system column structure is healed

---

## Validation Rules

| Rule | Behavior |
|---|---|
| Cannot delete a system column | API returns 403, frontend shows error toast |
| Cannot rename custom column to "Backlog", "Today", "Done" | API returns 400, frontend shows error |
| Deleting custom column moves tasks to Backlog | Tasks keep all fields including dates |
| Empty custom column can be deleted | No special handling needed |
| Position must be unique among siblings | `reorderColumns` handles this atomically |

---

## Edge Cases

- **Corrupted board.json with no columns:** Heal creates 3 system columns, `tasks: []`
- **Corrupted board.json with some columns:** Heal restores system columns, preserves custom columns and tasks
- **Custom column with reserved name exists:** This is fine — validation only applies on rename, not on creation
- **All custom columns deleted:** Board has only 3 system columns — valid state
- **Board with old data (no `kind`/`systemKey`):** Migrate on read, no data loss

---

## Scope

**In scope:**
- System column constants and type definitions
- Backend store migration + new operations
- API route additions (PATCH column, reorder endpoint)
- Frontend type sync
- Column card UI for custom columns (rename + delete)
- System columns protected from deletion
- Auto-heal on load

**Out of scope:**
- Task-level date fields (Epic 2)
- Task reconciliation (Epic 2)
- Column drag-and-drop reordering UI (Epic 4)
- Task creation UX (Epic 3)
