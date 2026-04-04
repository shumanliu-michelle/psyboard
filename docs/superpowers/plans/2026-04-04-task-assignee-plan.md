# Task Assignee + Icon Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `assignee?: 'SL' | 'KL'` field to tasks, replace text edit/delete buttons with SVG icons on TaskCard, and add an assign popover with SL/KL/unassigned options.

**Architecture:** The assignee is a new optional field on the Task type. The API PATCH route already handles partial updates — only the types and the `updateTask` store function need updating. The UI lives entirely in `TaskCard.tsx`.

**Tech Stack:** React, TypeScript, inline SVG icons (no external icon library), CSS-in-JS via inline styles.

---

## Task 1: Update types

**Files:**
- Modify: `client/src/types.ts:10-18`
- Modify: `server/src/types.ts:10-18`
- Modify: `server/src/store/boardStore.ts:95`

- [ ] **Step 1: Update `client/src/types.ts`**

Add `assignee?: 'SL' | 'KL'` to the `Task` type, and add it to `UpdateTaskInput`.

```typescript
export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number
  createdAt: string
  updatedAt: string
  assignee?: 'SL' | 'KL'
}

export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'columnId' | 'order' | 'assignee'>>
```

- [ ] **Step 2: Update `server/src/types.ts`** — same changes as above

```typescript
export type Task = {
  id: string
  title: string
  description?: string
  columnId: string
  order: number
  createdAt: string
  updatedAt: string
  assignee?: 'SL' | 'KL'
}

export type UpdateTaskInput = Partial<Pick<Task, 'title' | 'description' | 'columnId' | 'order' | 'assignee'>>
```

- [ ] **Step 3: Update `updateTask` in `server/src/store/boardStore.ts:95`**

Add `assignee` handling to the existing partial update:

```typescript
export function updateTask(id: string, updates: Partial<Pick<Task, 'title' | 'description' | 'columnId' | 'order' | 'assignee'>>): Task {
  // ... existing code ...
  if (updates.assignee !== undefined) task.assignee = updates.assignee
  // ... rest unchanged ...
}
```

- [ ] **Step 4: Commit**

```bash
git add client/src/types.ts server/src/types.ts server/src/store/boardStore.ts
git commit -m "feat: add assignee field to Task type"
```

---

## Task 2: Redesign TaskCard with icon buttons and assignee badge

**Files:**
- Modify: `client/src/components/TaskCard.tsx`

- [ ] **Step 1: Add inline SVG icons for edit and delete**

Replace the text buttons with SVG icon buttons at the top-right of the card. The icons go above the title row:

```tsx
// Add these near the top of the component
const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
)

const CrossIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)
```

- [ ] **Step 2: Replace action button row with icon-only layout**

Replace the existing `<div style={{ marginTop: 8, display: 'flex', gap: 4 }}>` section with the icon buttons at top-right:

```tsx
<div style={{
  position: 'absolute',
  top: 8,
  right: 8,
  display: 'flex',
  gap: 4,
  alignItems: 'center',
}}>
  {/* Assign button — person icon */}
  <button
    onClick={e => { e.stopPropagation(); setShowAssign(!showAssign) }}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px' }}
    title="Assign"
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  </button>
  <button
    onClick={e => { e.stopPropagation(); setEditing(true) }}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px' }}
    title="Edit"
  >
    <PencilIcon />
  </button>
  <button
    onClick={e => { e.stopPropagation(); handleDelete() }}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px' }}
    title="Delete"
  >
    <CrossIcon />
  </button>
</div>
```

Add `showAssign` state: `const [showAssign, setShowAssign] = useState(false)`

- [ ] **Step 3: Add assignee badge below title**

Add this after the title div in the non-editing return:

```tsx
{task.assignee && (
  <div style={{ marginTop: 4 }}>
    <span style={{
      background: task.assignee === 'SL' ? '#d1fae5' : '#dbeafe',
      color: task.assignee === 'SL' ? '#065f46' : '#1e40af',
      borderRadius: 4,
      padding: '2px 6px',
      fontSize: 11,
      fontWeight: 500,
    }}>
      {task.assignee}
    </span>
  </div>
)}
```

- [ ] **Step 4: Add assign popover**

Add below the icon buttons (inside the same absolute-positioned div). Use a small `<select>` that appears inline:

```tsx
{showAssign && (
  <div style={{
    position: 'absolute',
    top: 28,
    right: 8,
    background: 'white',
    border: '1px solid #e5e7eb',
    borderRadius: 6,
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    padding: 8,
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 100,
  }}>
    {(['SL', 'KL'] as const).map(opt => (
      <button
        key={opt}
        onClick={async e => {
          e.stopPropagation()
          try {
            await api.updateTask(task.id, { assignee: opt })
            onUpdated()
            setShowAssign(false)
          } catch (err) {
            console.error('Failed to assign:', err)
          }
        }}
        style={{
          background: task.assignee === opt ? (opt === 'SL' ? '#d1fae5' : '#dbeafe') : 'none',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          cursor: 'pointer',
          textAlign: 'left',
          fontSize: 13,
        }}
      >
        {opt}
      </button>
    ))}
    <button
      onClick={async e => {
        e.stopPropagation()
        try {
          await api.updateTask(task.id, { assignee: null as any })
          onUpdated()
          setShowAssign(false)
        } catch (err) {
          console.error('Failed to unassign:', err)
        }
      }}
      style={{
        background: !task.assignee ? '#f3f4f6' : 'none',
        border: 'none',
        borderRadius: 4,
        padding: '4px 8px',
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 13,
        color: '#6b7280',
      }}
    >
      Unassigned
    </button>
  </div>
)}
```

**Note:** `assignee: null` requires `UpdateTaskInput` to accept `null` for unassigning. If TypeScript errors, use `assignee: undefined` instead.

- [ ] **Step 5: Style the card to be `position: relative`**

Add `position: 'relative'` to the outer div so the absolute-positioned icon buttons anchor correctly:

```tsx
<div
  ref={setNodeRef}
  style={{ ...style, position: 'relative' }}
  className={`task-card${isDragging ? ' dragging' : ''}`}
  {...attributes}
  {...listeners}
>
```

- [ ] **Step 6: Remove the old `marginTop: 8, display: flex, gap: 4` button div**

Delete the old buttons section that had text "edit" and "delete" — replaced by the new icon buttons.

- [ ] **Step 7: Run the app and visually verify**

```bash
cd client && npm run dev
```

Check that icons appear, assignee badge shows correctly, and the assign popover works.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/TaskCard.tsx
git commit -m "feat: add assignee support and icon buttons to TaskCard"
```

---

## Task 3: Add E2E tests for assignee

**Files:**
- Modify: `e2e/board.spec.ts`

- [ ] **Step 1: Add assignee tests**

Add these tests to `e2e/board.spec.ts` after the existing tests:

```typescript
test('can assign a task to SL', async ({ page }) => {
  // Pre-seed a task
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.tasks.push({
    id: 'task-assign-001',
    title: 'Test assignment',
    columnId: board.columns[0].id,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  await page.goto('/')

  // Click assign button on the task
  const task = page.locator('.task-card', { hasText: 'Test assignment' })
  await task.locator('button[title="Assign"]').click()

  // Click SL option
  await page.locator('button', { hasText: 'SL' }).click()

  // Badge appears with SL
  await expect(task.locator('text=SL')).toBeVisible()
})

test('can assign a task to KL and change', async ({ page }) => {
  // Pre-seed a task
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.tasks.push({
    id: 'task-assign-002',
    title: 'Test KL assignment',
    columnId: board.columns[0].id,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  await page.goto('/')

  const task = page.locator('.task-card', { hasText: 'Test KL assignment' })

  // Assign to KL
  await task.locator('button[title="Assign"]').click()
  await page.locator('button', { hasText: 'KL' }).click()
  await expect(task.locator('text=KL')).toBeVisible()

  // Change to SL
  await task.locator('button[title="Assign"]').click()
  await page.locator('button', { hasText: 'SL' }).click()
  await expect(task.locator('text=SL')).toBeVisible()
  await expect(task.locator('text=KL')).not.toBeVisible()
})

test('can unassign a task', async ({ page }) => {
  // Pre-seed a task with KL assignee
  const board = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  board.tasks.push({
    id: 'task-unassign-001',
    title: 'Test unassign',
    columnId: board.columns[0].id,
    order: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    assignee: 'KL',
  })
  fs.writeFileSync(DATA_FILE, JSON.stringify(board, null, 2), 'utf-8')

  await page.goto('/')

  const task = page.locator('.task-card', { hasText: 'Test unassign' })
  await expect(task.locator('text=KL')).toBeVisible()

  // Unassign
  await task.locator('button[title="Assign"]').click()
  await page.locator('button', { hasText: 'Unassigned' }).click()

  // Badge gone
  await expect(task.locator('text=KL')).not.toBeVisible()
})
```

- [ ] **Step 2: Run E2E tests**

```bash
cd e2e && npx playwright test --reporter=list
```

Expected: all 10 tests pass (7 existing + 3 new).

- [ ] **Step 3: Commit**

```bash
git add e2e/board.spec.ts
git commit -m "test: add E2E tests for task assignee feature"
```

---

## Self-Review Checklist

- [ ] `assignee` added to `Task` type in both client and server
- [ ] `assignee` added to `UpdateTaskInput` in both client and server
- [ ] `boardStore.ts` `updateTask` handles `assignee` updates
- [ ] TaskCard has pencil/cross SVG icons in top-right
- [ ] Assign button opens popover with SL / KL / Unassigned options
- [ ] Assignee badge appears below title only when `task.assignee` is set
- [ ] Badge colors: SL = green, KL = blue
- [ ] `UpdateTaskInput` allows `null` for clearing assignee (or use `undefined`)
- [ ] All 10 E2E tests pass
