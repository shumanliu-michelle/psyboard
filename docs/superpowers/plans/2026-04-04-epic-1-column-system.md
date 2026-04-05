# Epic 1: Column System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a hybrid column system with 3 protected system columns (Backlog, Today, Done) and user-created custom columns. System columns use fixed IDs, are protected from deletion, but are reorderable. Custom columns are fully manageable with a kebab menu.

**Architecture:** Backend-first: update types, then store operations, then API routes, then frontend. Auto-heal logic lives in `readBoard()`. Frontend mirrors server types and adds kebab menu UI to ColumnCard for custom columns.

**Tech Stack:** Node.js + Express + TypeScript (backend), React + TypeScript (frontend), JSON file persistence

---

### Task 1: Update Column types (server + client)

**Files:**
- Modify: `server/src/types.ts:1-35`
- Modify: `client/src/types.ts:1-35`

- [ ] **Step 1: Update server Column type**

Replace the `Column` type definition in `server/src/types.ts` with:

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

export const BACKLOG_COLUMN_ID = 'col-backlog'
export const TODAY_COLUMN_ID  = 'col-today'
export const DONE_COLUMN_ID   = 'col-done'
```

Remove the old `order`-based Column type. Keep Task and Board types unchanged.

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit 2>&1`
Expected: No errors (types only, nothing uses the new fields yet)

- [ ] **Step 3: Copy updated types to client**

Copy the same `ColumnKind`, `SystemKey`, `Column` type, and three constants into `client/src/types.ts`. Keep the file comment about syncing with server.

- [ ] **Step 4: Verify client TypeScript compilation**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npx tsc --noEmit 2>&1`
Expected: No errors related to the new types

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/types.ts client/src/types.ts
git commit -m "feat(types): add ColumnKind, SystemKey, position to Column type"
```

---

### Task 2: Auto-heal + migration in `readBoard()`

**Files:**
- Modify: `server/src/store/boardStore.ts`

- [ ] **Step 1: Read current boardStore.ts for context**

The current file starts at line 11 with `DEFAULT_COLUMNS` using random UUIDs. The new spec says system columns use fixed IDs. Since this is a fresh project, we can simply replace the default columns.

- [ ] **Step 2: Replace DEFAULT_COLUMNS and readBoard()**

Replace the `DEFAULT_COLUMNS` constant and `readBoard()` function with:

```ts
const SYSTEM_COLUMNS: Column[] = [
  { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
]

const DEFAULT_BOARD: Board = {
  columns: [...SYSTEM_COLUMNS],
  tasks: [],
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

export function readBoard(): Board {
  ensureDataDir()
  if (!fs.existsSync(BOARD_FILE)) {
    writeBoard(DEFAULT_BOARD)
    return DEFAULT_BOARD
  }
  try {
    const raw = fs.readFileSync(BOARD_FILE, 'utf-8')
    const board = JSON.parse(raw) as Board
    return migrateAndHeal(board)
  } catch {
    const board = DEFAULT_BOARD
    writeBoard(board)
    return board
  }
}

function migrateAndHeal(board: Board): Board {
  const now = new Date().toISOString()
  const hasSystemColumns = (col: Column) =>
    col.id === BACKLOG_COLUMN_ID || col.id === TODAY_COLUMN_ID || col.id === DONE_COLUMN_ID

  // Ensure all 3 system columns exist with correct kind/systemKey
  const existingSystem = board.columns.filter(c => hasSystemColumns(c))
  const missingSystem: Column[] = []

  for (const sys of SYSTEM_COLUMNS) {
    if (!board.columns.find(c => c.id === sys.id)) {
      missingSystem.push({ ...sys, createdAt: now, updatedAt: now })
    }
  }

  // Migrate old data: add kind/systemKey/position if missing
  const migratedColumns = board.columns.map(col => {
    if (hasSystemColumns(col)) {
      // It's a system column by ID — ensure correct kind/systemKey
      const sysKey = col.id === BACKLOG_COLUMN_ID ? 'backlog'
        : col.id === TODAY_COLUMN_ID ? 'today' : 'done'
      return {
        ...col,
        kind: 'system' as const,
        systemKey: sysKey as SystemKey,
        position: col.position ?? col.order ?? 0,
        updatedAt: now,
      }
    } else {
      // Custom column
      return {
        ...col,
        kind: 'custom' as const,
        position: col.position ?? col.order ?? board.columns.indexOf(col),
        updatedAt: now,
      }
    }
  })

  // Add missing system columns
  const allColumns = [...migratedColumns, ...missingSystem]

  const healedBoard: Board = {
    ...board,
    columns: allColumns,
    tasks: board.tasks ?? [],
  }
  writeBoard(healedBoard)
  return healedBoard
}
```

**Note:** `migrateAndHeal` is called inside `readBoard()` after parsing. It modifies the board in memory and persists. On first load with fresh data, it just ensures system columns are present.

- [ ] **Step 3: Verify server starts without errors**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsx src/index.ts &
sleep 2 && curl -s http://localhost:3001/api/board | head -c 200; kill %1 2>/dev/null`
Expected: JSON with `col-backlog`, `col-today`, `col-done` columns

- [ ] **Step 4: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/boardStore.ts
git commit -m "feat(store): add auto-heal and migration for system columns

- System columns now use fixed IDs (col-backlog, col-today, col-done)
- migrateAndHeal() restores missing system columns on load
- Migrates old order->position and adds kind/systemKey fields"
```

---

### Task 3: Add `updateColumn` and `reorderColumns` to boardStore

**Files:**
- Modify: `server/src/store/boardStore.ts`

Add these two functions after the existing `deleteColumn` function (after line 74):

```ts
const RESERVED_NAMES = ['Backlog', 'Today', 'Done']

export function updateColumn(id: string, updates: { title?: string; position?: number }): Column {
  const board = readBoard()
  const column = board.columns.find(c => c.id === id)

  if (!column) {
    throw new Error('Column not found')
  }
  if (column.kind === 'system') {
    throw new Error('Cannot update a system column')
  }

  if (updates.title !== undefined) {
    if (RESERVED_NAMES.includes(updates.title.trim())) {
      throw new Error('Cannot rename column to a reserved name')
    }
    column.title = updates.title.trim()
  }

  if (updates.position !== undefined) {
    const oldPos = column.position
    const newPos = updates.position

    board.columns.forEach(c => {
      if (c.id === id) {
        c.position = newPos
      } else if (oldPos < newPos) {
        // Shifting left to make room
        if (c.position > oldPos && c.position <= newPos) {
          c.position = c.position - 1
        }
      } else if (oldPos > newPos) {
        // Shifting right to make room
        if (c.position >= newPos && c.position < oldPos) {
          c.position = c.position + 1
        }
      }
    })
  }

  column.updatedAt = new Date().toISOString()
  writeBoard(board)
  return column
}

export function reorderColumns(columnIds: string[]): Column[] {
  const board = readBoard()

  columnIds.forEach((id, index) => {
    const col = board.columns.find(c => c.id === id)
    if (col) {
      col.position = index
      col.updatedAt = new Date().toISOString()
    }
  })

  writeBoard(board)
  return board.columns.slice().sort((a, b) => a.position - b.position)
}
```

- [ ] **Step 2: Update deleteColumn to protect system columns**

Replace the `deleteColumn` function (lines 68-74) with:

```ts
export function deleteColumn(id: string): void {
  const board = readBoard()
  const column = board.columns.find(c => c.id === id)

  if (!column) {
    throw new Error('Column not found')
  }
  if (column.kind === 'system') {
    throw new Error('Cannot delete system column')
  }

  // Move tasks to Backlog
  board.tasks = board.tasks.map(t =>
    t.columnId === id ? { ...t, columnId: BACKLOG_COLUMN_ID } : t
  )

  board.columns = board.columns.filter(c => c.id !== id)
  writeBoard(board)
}
```

- [ ] **Step 3: Update createColumn to set kind: 'custom'**

Replace the `createColumn` function to include `kind: 'custom'`:

```ts
export function createColumn(title: string): Column {
  const board = readBoard()
  const now = new Date().toISOString()
  const column: Column = {
    id: randomUUID(),
    title,
    kind: 'custom',
    position: board.columns.length,
    createdAt: now,
    updatedAt: now,
  }
  board.columns.push(column)
  writeBoard(board)
  return column
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/store/boardStore.ts
git commit -m "feat(store): add updateColumn, reorderColumns, protect system columns"
```

---

### Task 4: Add PATCH and reorder API routes to columns.ts

**Files:**
- Modify: `server/src/routes/columns.ts`

- [ ] **Step 1: Add imports and new routes**

Update the imports line to include the new functions:

```ts
import { createColumn, deleteColumn, readBoard, updateColumn, reorderColumns } from '../store/boardStore.js'
```

Add two new routes after the DELETE route (before `export default`):

```ts
router.patch('/:id', (req, res) => {
  const { id } = req.params
  const updates = req.body as { title?: string; position?: number }

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid column ID' })
    return
  }

  if (updates.title !== undefined) {
    if (typeof updates.title !== 'string' || updates.title.trim().length === 0) {
      res.status(400).json({ error: 'Title must be a non-empty string' })
      return
    }
  }

  if (updates.position !== undefined) {
    if (typeof updates.position !== 'number' || updates.position < 0) {
      res.status(400).json({ error: 'Position must be a non-negative number' })
      return
    }
  }

  try {
    const column = updateColumn(id, updates)
    res.json(column)
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'Column not found') {
        res.status(404).json({ error: 'Column not found' })
        return
      }
      if (err.message === 'Cannot delete system column' || err.message === 'Cannot update a system column') {
        res.status(403).json({ error: err.message })
        return
      }
      if (err.message === 'Cannot rename column to a reserved name') {
        res.status(400).json({ error: err.message })
        return
      }
    }
    res.status(500).json({ error: 'Failed to update column' })
  }
})

router.post('/reorder', (req, res) => {
  const { columnIds } = req.body as { columnIds?: string[] }

  if (!Array.isArray(columnIds) || columnIds.length === 0) {
    res.status(400).json({ error: 'columnIds must be a non-empty array' })
    return
  }

  // Verify all column IDs exist
  const board = readBoard()
  const allExist = columnIds.every(id => board.columns.some(c => c.id === id))
  if (!allExist) {
    res.status(400).json({ error: 'One or more column IDs are invalid' })
    return
  }

  try {
    const columns = reorderColumns(columnIds)
    res.json({ columns })
  } catch (err) {
    res.status(500).json({ error: 'Failed to reorder columns' })
  }
})
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /Users/shumanliu/Projects/psyboard/server && npx tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 3: Test new routes manually**

Start the server: `cd /Users/shumanliu/Projects/psyboard && npm run dev`
In another terminal, test:

```bash
# Create a custom column
curl -s -X POST http://localhost:3001/api/columns -H "Content-Type: application/json" -d '{"title":"Test Column"}'

# Rename it
curl -s -X PATCH http://localhost:3001/api/columns/<id> -H "Content-Type: application/json" -d '{"title":"My Tasks"}'

# Try renaming to reserved name (should fail 400)
curl -s -X PATCH http://localhost:3001/api/columns/<id> -H "Content-Type: application/json" -d '{"title":"Backlog"}'

# Try deleting system column (should fail 403)
curl -s -X DELETE http://localhost:3001/api/columns/col-backlog" -w "\n%{http_code}"

# Reorder
curl -s -X POST http://localhost:3001/api/columns/reorder -H "Content-Type: application/json" -d '{"columnIds":["col-backlog","col-today","col-done","<custom-id>"]}'
```

- [ ] **Step 4: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add server/src/routes/columns.ts
git commit -m "feat(api): add PATCH /api/columns/:id and POST /api/columns/reorder"
```

---

### Task 5: ColumnCard kebab menu UI for custom columns

**Files:**
- Modify: `client/src/components/ColumnCard.tsx`

- [ ] **Step 1: Add KebabIcon import (reuse existing)**

ColumnCard already imports from `../api`. Import the KebabIcon from TaskCard. Since KebabIcon was exported from TaskCard, it can be imported directly:

```ts
import { KebabIcon } from './TaskCard'
```

- [ ] **Step 2: Add state for menu and rename mode**

Add to the state declarations in ColumnCard:

```ts
const [showMenu, setShowMenu] = useState(false)
const [renaming, setRenaming] = useState(false)
const [renameValue, setRenameValue] = useState(column.title)
const [confirmDelete, setConfirmDelete] = useState(false)
const menuRef = useRef<HTMLDivElement>(null)
```

- [ ] **Step 3: Refactor click-outside handler**

Add a `useEffect` near the existing ones:

```ts
useEffect(() => {
  if (!showMenu) return
  const handler = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setShowMenu(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [showMenu])
```

- [ ] **Step 4: Refactor header to use kebab menu for custom columns**

Replace the column header div (lines 35-42) with:

```tsx
{column.kind === 'custom' ? (
  <div className="column-header" ref={menuRef} style={{ position: 'relative' }}>
    {renaming ? (
      <input
        autoFocus
        value={renameValue}
        onChange={e => setRenameValue(e.target.value)}
        onKeyDown={async e => {
          if (e.key === 'Enter') {
            try {
              await api.updateColumn(column.id, { title: renameValue.trim() })
              setRenaming(false)
              onRefresh()
            } catch { setRenameValue(column.title); setRenaming(false) }
          }
          if (e.key === 'Escape') { setRenameValue(column.title); setRenaming(false) }
        }}
        onBlur={async () => {
          try {
            await api.updateColumn(column.id, { title: renameValue.trim() })
            onRefresh()
          } catch { }
          setRenaming(false)
        }}
      />
    ) : (
      <h3>{column.title}</h3>
    )}
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="task-count">{tasks.length}</span>
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}
          aria-label="Menu"
        >
          <KebabIcon />
        </button>
        {showMenu && (
          <div style={{
            position: 'absolute',
            top: 20,
            right: 0,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: 4,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 90,
          }}>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(false); setRenaming(true) }}
              style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
            >
              Rename
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
              style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
    {confirmDelete && (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 300 }}>
          <p style={{ marginBottom: 16 }}>Delete column "{column.title}"? All tasks will be moved to Backlog.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={async () => {
              try {
                await api.deleteColumn(column.id)
                setConfirmDelete(false)
                onRefresh()
              } catch { setConfirmDelete(false) }
            }} style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
          </div>
        </div>
      </div>
    )}
  </div>
) : (
  // System column — no kebab menu
  <div className="column-header">
    <h3>{column.title}</h3>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="task-count">{tasks.length}</span>
    </div>
  </div>
)}
```

**Note:** This replaces the entire `<div className="column-header">` block. The original had a delete button for all columns — now it only appears for custom columns via the kebab menu.

- [ ] **Step 5: Add `updateColumn` to api**

Read `client/src/api.ts` and add an `updateColumn` function:

```ts
export const api = {
  // ... existing functions
  updateColumn: (id: string, updates: { title?: string; position?: number }) =>
    fetch(`/api/columns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).then(r => { if (!r.ok) throw new Error('Failed to update column'); return r.json() }),
}
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm run build 2>&1 | tail -20`
Expected: No TypeScript or build errors

- [ ] **Step 7: Manual browser test**

Start dev server and verify in browser:
1. System columns (Backlog, Today, Done) show no kebab menu
2. Custom columns show kebab menu on click
3. Clicking "Rename" → title becomes editable input
4. Clicking "Delete" → confirmation dialog appears
5. Confirm delete → column removed, tasks moved to Backlog

- [ ] **Step 8: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/components/ColumnCard.tsx client/src/api.ts
git commit -m "feat(ui): add kebab menu for custom column rename/delete

- Custom columns show vertical-kebab menu (⋮) in header
- Dropdown: Rename and Delete actions
- Inline rename on title via input field
- Delete confirmation dialog before removal
- System columns protected from deletion
- Tasks moved to Backlog on custom column delete"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Column type with kind/systemKey/position | Task 1 |
| System column constants (col-backlog, etc.) | Task 1 |
| Auto-heal on load | Task 2 |
| Migration from order→position | Task 2 |
| createColumn sets kind: 'custom' | Task 3 |
| deleteColumn blocks system columns | Task 3 |
| deleteColumn moves tasks to Backlog | Task 3 |
| updateColumn function | Task 3 |
| reorderColumns function | Task 3 |
| PATCH /api/columns/:id route | Task 4 |
| POST /api/columns/reorder route | Task 4 |
| Frontend type sync | Task 1 |
| ColumnCard kebab menu (custom only) | Task 5 |
| Delete confirmation dialog | Task 5 |
| Inline rename for custom columns | Task 5 |

## Self-Review

- No placeholders — all code shown inline
- `updateColumn` throws on attempt to update system column — routes catch and return 403
- `deleteColumn` throws on attempt to delete system column — routes catch and return 403
- `renameColumn` validates reserved names in store layer, not just API layer
- `reorderColumns` uses position index from array order — clean and simple
- Kebab dropdown uses same styling as TaskCard dropdown (same box-shadow, border-radius, colors)
- Confirmation dialog is a simple centered modal with overlay
