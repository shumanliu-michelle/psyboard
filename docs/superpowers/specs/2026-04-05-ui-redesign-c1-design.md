# Psyboard UI Redesign — C1 Indigo & Amber

## Status
Approved 2026-04-05

## Overview

Redesign psyboard's visual design from plain gray prototype to a commercial-grade Kanban board. Adopt the **C1 — Indigo & Amber** aesthetic: crisp white cards on a cool slate-gray board background, color-coded columns with vibrant accent headers.

---

## Design Language

### Aesthetic
**C1 — Indigo & Amber (light)** — Clean, modern, professional. White cards on slate gray. Each column has a distinct color identity through its header. Vibrant but not cluttered.

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `bg-board` | `#f8fafc` | Board background (slate-50) |
| `bg-card` | `#ffffff` | Task card background |
| `accent-backlog` | `#6366f1` | Indigo — Backlog column header |
| `accent-today` | `#f59e0b` | Amber — Today column header |
| `accent-done` | `#22c55e` | Green — Done column header |
| `accent-appointment` | `#ec4899` | Pink — Appointment column header |
| `accent-shopping` | `#14b8a6` | Teal — Shopping column header |
| `accent-this-week` | `#8b5cf6` | Violet — This Week column header |
| `accent-custom` | `#f97316` | Orange — Custom user columns |
| `priority-high` | `#ef4444` | Red left border on task card |
| `priority-medium` | `#f59e0b` | Amber left border on task card |
| `priority-low` | `#22c55e` | Green left border on task card |
| `assignee-sl-bg` | `#eef2ff` | SL avatar background |
| `assignee-sl-text` | `#6366f1` | SL avatar text |
| `assignee-kl-bg` | `#dbeafe` | KL avatar background |
| `assignee-kl-text` | `#1e40af` | KL avatar text |
| `text-done` | `#9ca3af` | Strikethrough for completed tasks |
| `text-muted` | `#6b7280` | Description text, metadata |
| `border-default` | `#d1d5db` | Input borders, subtle borders |
| `shadow-tinted` | per-column | Card box-shadow tinted to column color |

### Typography
System font stack unchanged: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### Spacing
- Column gap: `16px` (existing `board` gap: `16px`)
- Column padding: `0` (overflow: hidden on container)
- Column header padding: `10px 14px`
- Column tasks area padding: `8px`
- Card padding: `10px 12px`
- Card gap: `8px`

---

## Components

### Board Background
```css
.board {
  background: #f8fafc;  /* was #f5f5f5 */
  /* rest unchanged */
}
```

### Column Container
- `background: white`
- `border-radius: 12px` (was 8px)
- `box-shadow: 0 4px 16px rgba(99,102,241,0.10)` — tinted to column accent
- `overflow: hidden` — so colored top border clips cleanly
- **2px colored top border** — primary column identity marker
- Min/max width unchanged

### Column Header
- Background: transparent (no separate bg)
- Colored dot (7px circle) + column name in accent color
- Task count badge: tinted pill matching column color
- `border-bottom: none` (color comes from container top border)
- Uppercase, letter-spaced column name

### Task Card
- `background: white`
- `border-radius: 8px` (was 6px)
- `box-shadow: 0 2px 8px rgba(0,0,0,0.06)` (was `0 1px 3px rgba(0,0,0,0.1)`)
- **Left border stripe** (3px) indicating priority: red/amber/green or none
- Layout unchanged: grip left, title+desc center, kebab+assignee right
- Completed (Done column): `text-decoration: line-through`, `color: #9ca3af`, `opacity: 0.6`

### Assignee Avatar
- Circle: `width: 18px; height: 18px; border-radius: 50%`
- SL: indigo bg (`#eef2ff`), indigo text
- KL: blue bg (`#dbeafe`), blue text (`#1e40af`)
- Font: `11px, font-weight: 600`

### Priority Badge (on task card)
- No full badge on card — just the colored left border stripe
- In drawer: full pill button group

### Task Drawer
- Width: `380px` (unchanged)
- Background: white
- Header: clean, `border-bottom: 1px solid #e5e7eb`
- Labels: `11px, uppercase, letter-spaced, color: #6b7280`
- Inputs: `border: 1px solid #d1d5db`, `border-radius: 8px`, white bg
- Column selector: pill button group, selected = column accent color
- Priority selector: pill button group, selected = red tinted bg
- Assignee selector: pill button group, selected = respective assignee color
- Save button: `#6366f1` (indigo), white text, `border-radius: 8px`
- Mark Done: `#d1fae5` bg, `#065f46` text, green border
- Delete: white bg, red text, red border

### Add Task / Column Buttons
- Unchanged in behavior
- Subtle style updates: hover state uses column accent color

### Drag Overlay
- Card shows with `opacity: 0.9`, `box-shadow: 0 4px 12px rgba(0,0,0,0.15)`

---

## What's NOT Changing

- **Layout**: columns, board structure, horizontal scroll
- **Interactions**: drag & drop behavior, add forms, drawer open/close
- **Data model**: no changes
- **API**: no changes
- **Functionality**: all existing features preserved

---

## Scope

CSS-only redesign. Changes concentrated in:
1. `client/src/index.css` — board, column, card, drawer, input styles
2. `client/src/components/TaskCard.tsx` — assignee avatar colors, priority border
3. `client/src/components/ColumnCard.tsx` — header dot + column name colors
4. `client/src/components/BoardView.tsx` — minimal if any (likely none)
5. `client/src/components/TaskDrawer.tsx` — drawer action button colors

---

## Implementation Notes

- Column accent color should come from a `columnColor` field added to the Column type, with defaults per `systemKey`. Custom columns default to orange.
- For card shadows, use `filter: drop-shadow` or hardcode per-column shadow values.
- Use CSS custom properties for the palette so it can be easily adjusted.
- Ensure dark mode is **not** implemented in this phase — this is light-only.
