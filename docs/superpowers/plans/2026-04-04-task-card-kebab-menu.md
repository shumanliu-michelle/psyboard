# Task Card Kebab Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three horizontal icon buttons on each TaskCard with a single vertical "kebab" menu (⋮) that opens a dropdown with Assign, Edit, and Delete actions.

**Architecture:** Single-file change in `TaskCard.tsx` — replace the 3-button group with one kebab button and a dropdown popover. Existing state (`showAssign`, `editing`) and handlers (`handleDelete`) are reused. Click-outside handler is refactored to close either the kebab dropdown or the assignee popover.

**Tech Stack:** React, TypeScript, CSS-in-JS (inline styles), @dnd-kit/sortable

---

### Task 1: Add KebabIcon SVG component

**Files:**
- Modify: `client/src/components/TaskCard.tsx:13-30`

- [ ] **Step 1: Add KebabIcon component**

After line 30 (after `PersonIcon`), add the following:

```tsx
const KebabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </svg>
)
```

- [ ] **Step 2: Verify build still passes**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm run build 2>&1 | tail -20`
Expected: No errors (just a new component, no usage yet)

- [ ] **Step 3: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/components/TaskCard.tsx
git commit -m "feat(TaskCard): add KebabIcon component"
```

---

### Task 2: Replace 3-icon buttons with kebab button + dropdown

**Files:**
- Modify: `client/src/components/TaskCard.tsx`

**Changes summary:**
- Remove `PencilIcon`, `CrossIcon`, `PersonIcon` (no longer needed)
- Add `showMenu` state to track kebab dropdown open/closed
- Replace the 3-button container with a single kebab button
- Add dropdown menu with Assign, Edit, Delete items
- Refactor click-outside handler to close `showMenu` when open (keep existing `showAssign` logic separate)
- When Assign is clicked: close dropdown, open assignee popover
- When Edit is clicked: close dropdown, enter edit mode
- When Delete is clicked: close dropdown, delete task

- [ ] **Step 1: Replace the three icon buttons and add kebab dropdown**

Replace lines 114-147 (the three-button `div`) with:

```tsx
<div style={{
  position: 'absolute',
  top: 8,
  right: 8,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  zIndex: 5,
}}>
  <button
    onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}
    aria-label="Menu"
  >
    <KebabIcon />
  </button>
  {showMenu && (
    <div ref={popoverRef} style={{
      position: 'absolute',
      top: 24,
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
        onClick={e => { e.stopPropagation(); setShowMenu(false); setShowAssign(true) }}
        style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
      >
        Assign
      </button>
      <button
        onClick={e => { e.stopPropagation(); setShowMenu(false); setEditing(true) }}
        style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
      >
        Edit
      </button>
      <button
        onClick={e => { e.stopPropagation(); setShowMenu(false); handleDelete() }}
        style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}
      >
        Delete
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 2: Add `showMenu` state**

Add to the state declarations (around line 33):

```tsx
const [showMenu, setShowMenu] = useState(false)
```

- [ ] **Step 3: Refactor click-outside handler to close `showMenu`**

Replace the `useEffect` on lines 38-48 with:

```tsx
// Close menu/popover on click outside
useEffect(() => {
  if (!showMenu && !showAssign) return
  const handler = (e: MouseEvent) => {
    const menuEl = popoverRef.current
    if (menuEl && !menuEl.contains(e.target as Node)) {
      setShowMenu(false)
      setShowAssign(false)
    }
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [showMenu, showAssign])
```

- [ ] **Step 4: Remove unused icon components**

Delete the `PencilIcon` (lines 13-17), `CrossIcon` (lines 19-23), and `PersonIcon` (lines 25-30) definitions — they are replaced by text labels in the dropdown. The `showAssign` popover logic remains unchanged.

- [ ] **Step 5: Verify it builds**

Run: `cd /Users/shumanliu/Projects/psyboard/client && npm run build 2>&1 | tail -20`
Expected: No TypeScript or build errors

- [ ] **Step 6: Manual test in browser**

Start dev server: `cd /Users/shumanliu/Projects/psyboard && npm run dev`
Open browser, verify:
1. Each task card shows a kebab icon (⋮) in top-right instead of 3 icons
2. Clicking kebab opens a dropdown with Assign, Edit, Delete
3. Clicking Assign → assignee popover appears
4. Clicking Edit → inline edit mode activates
5. Clicking Delete → task is deleted
6. Clicking outside dropdown → closes dropdown

- [ ] **Step 7: Commit**

```bash
cd /Users/shumanliu/Projects/psyboard
git add client/src/components/TaskCard.tsx
git commit -m "feat(TaskCard): replace 3 icon buttons with kebab menu

- Single kebab icon (⋮) replaces person/pencil/cross icons
- Dropdown menu with Assign, Edit, Delete actions
- Click-outside handler closes dropdown or assignee popover
- Reuses existing showAssign, editing, handleDelete logic"
```

---

### Task 3: Run e2e tests

**Files:**
- Test: `e2e/board.spec.ts` (if it exists)

- [ ] **Step 1: Run e2e tests**

Run: `cd /Users/shumanliu/Projects/psyboard/e2e && npx playwright test 2>&1`
Expected: All tests pass

---

## Spec Coverage Check

| Spec requirement | Task |
|---|---|
| Kebab icon replaces 3 horizontal icons | Task 2 |
| Dropdown with Assign, Edit, Delete | Task 2 |
| Click outside closes dropdown | Task 2 |
| Assign opens existing assignee popover | Task 2 |
| Edit enters inline edit mode | Task 2 |
| Delete deletes the task | Task 2 |
| Reuses existing state/handlers | Task 2 |

## Self-Review

- No placeholders — all code is shown inline
- `KebabIcon` uses circles with `fill="currentColor"` to create dots (more reliable than small rects)
- Dropdown uses `position: absolute` with `top: 24` to appear below the kebab button
- `popoverRef` is reused for the dropdown (it's already on the container div)
- `showMenu` state is separate from `showAssign` — clicking Assign in the dropdown properly chains the close + open
