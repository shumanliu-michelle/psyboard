# CSS Audit & Convention Implementation Plan

> **For agentic workers:** This is an audit/refactor task — not TDD. No new features, just conflict detection and cleanup.

**Goal:** Find CSS class vs inline style conflicts, fix them, and add convention to CLAUDE.md.

**Architecture:** Targeted audit — scan each component for inline styles that duplicate CSS class properties, fix only conflicts, update CLAUDE.md.

**Tech Stack:** None (CSS audit only)

---

## Task 1: Audit — Find Conflicts

**Files:** All `.tsx` components in `client/src/components/`

Audit inline styles against CSS classes in `index.css`. A conflict = both CSS class and inline `style={{}}` set the same CSS property on the same element.

**Common conflict categories to check:**
- `opacity` (CSS class vs inline on task-card)
- `display`, `flexDirection`, `gap` (popover menus)
- `background`, `color`, `borderRadius` (buttons)

**Approach:**
- Read each component, note all `style={{}}` instances
- Read relevant CSS class definitions in `index.css`
- Flag conflicts: where CSS class sets a property and inline also sets it

**Known conflicts from previous session:**
- `.task-card.dimmed { opacity: 0.3 }` vs inline `opacity: dimmed ? 0.1 : 1` — **FIXED** (moved to CSS)

**Output:** List of files with 0, 1, or more conflicts.

Commit: `audit: identify CSS/inline style conflicts across components`

---

## Task 2: Fix TaskCard Conflicts

**Files:** `client/src/components/TaskCard.tsx`, `client/src/index.css`

After audit, fix any remaining conflicts in TaskCard. Already know `.task-card.dimmed { opacity }` was fixed in a previous session. Verify no other conflicts remain.

Run tests after changes:
```
cd client && npm test -- --run --testNamePattern="TaskCard" 2>&1 | tail -5
```

Commit: `refactor(TaskCard): resolve CSS class vs inline style conflicts`

---

## Task 3: Fix ColumnCard Conflicts

**Files:** `client/src/components/ColumnCard.tsx`, `client/src/index.css`

After audit, fix any conflicts in ColumnCard.

Run tests:
```
cd client && npm test -- --run --testNamePattern="ColumnCard" 2>&1 | tail -5
```

Commit: `refactor(ColumnCard): resolve CSS class vs inline style conflicts`

---

## Task 4: Fix Remaining Component Conflicts

**Files:** `client/src/components/BoardView.tsx`, `client/src/components/TaskDrawer.tsx`, `client/src/components/HeaderToolbar.tsx`, `client/src/components/QuickAddForm.tsx`, `client/src/components/AddColumnForm.tsx`, `client/src/components/Toast.tsx`

Fix conflicts found in audit (per component).

Run full test suite:
```
cd client && npm test -- --run 2>&1 | tail -5
```

Commit: `refactor: resolve remaining CSS class vs inline style conflicts`

---

## Task 5: Add Convention to CLAUDE.md

**Files:** `CLAUDE.md`

Add to the Conventions section:

```markdown
## CSS: Inline Styles vs CSS Classes

Prefer CSS classes for layout, typography, colors, states, pseudo-selectors, and media queries.
Use inline `style={{}}` only for values computed at render time (e.g., dynamic colors from priority, transform from drag, opacity from dim state).
Avoid having both CSS class and inline style set the same property on the same element.
```

Commit: `docs: add CSS inline/class convention to CLAUDE.md`

---

## Self-Review

- [ ] All audit findings documented
- [ ] Each component's conflicts fixed
- [ ] No CSS class + inline conflict remains
- [ ] CLAUDE.md convention added
- [ ] All tests pass
