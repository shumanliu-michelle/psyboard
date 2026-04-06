# Header Toolbar — Design Spec

## What

A floating toolbar (bottom-right) with icon buttons for: search, assignee filter, dark mode toggle, fullscreen, and SSE connection status. All features work in both normal and full screen mode.

---

## 1. Floating Toolbar

### Appearance
- Floating pill anchored to bottom-right of viewport
- `position: fixed`, `bottom: 20px`, `right: 20px`
- White background, 1px border (`#e2e8f0`), border-radius `999px`
- Box shadow: `0 4px 16px rgba(0,0,0,0.12)`
- Padding: `8px 14px`, gap between items: `8px`
- Z-index: `9999`

### Icon buttons (collapsed state)
| Icon | Action | Visual |
|------|--------|--------|
| 🔍 (magnifier) | Toggle search | `#e2e8f0` pill |
| 👤 (person) | Toggle filter | `#e2e8f0` pill |
| 🌗 (last-quarter moon) | Toggle dark mode — shows sun in light mode | `#e2e8f0` pill |
| 🔲 (open square) | Toggle fullscreen | `#e2e8f0` pill |
| ● (dot) | SSE status indicator | green/red/pulsing, no background |

### Dark mode icon note
🌗 is the "last quarter moon" emoji. In light mode, render as 🌑 (new moon) to clearly suggest "switch to dark." In dark mode, render as 🌕 (full moon) to suggest "switch to light."

### Collapsed state
- All icons visible in a row: 🔍 👤 🌗 🔲 ●
- 🔍 👤 🌗 🔲 each 28x28px with `#e2e8f0` background pill
- SSE ● dot: 8px circle, no background pill, far right

### Expanded state (search)
- Pill widens to fit input + count + × button
- Input: `180px` wide, no border, placeholder "Search tasks..."
- Count badge: `"N tasks"` right-aligned, muted gray, `font-size: 11px`
- × button on far right to close
- Only one expanded mode active at a time (search OR filter)

### Expanded state (filter)
- Shows label "Filter:" then chips: SL | KL | None
- Chips are multi-select toggle — clicking a chip toggles it on/off
- Selected chip: pastel fill (same color as the assignee chip in task cards)
  - SL selected: `background: #fdf2f8`, `color: #ec4899`, border `#f9a8d4`
  - KL selected: `background: #dbeafe`, `color: #1e40af`, border `#93c5fd`
  - None selected: `background: #fef3c7`, `color: #92400e`, border `#fcd34d`
- Unselected chips: transparent background, muted border matching the same color
- × button to close and deactivate filter

### Keyboard shortcuts
| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen (native); close expanded search/filter |

---

## 2. Search

### Behavior
1. Click 🔍 icon → pill expands to search input (see above)
2. Type query → match against `task.title` (case-insensitive substring match)
3. Board updates in real time:
   - Matching tasks: fully visible
   - Non-matching tasks: `opacity: 0.3`
4. Count on right side of input updates live: `"N tasks"` or `"0 tasks"` or blank if empty
5. Press `Escape` or click × → search closes, board returns to normal (all tasks visible)

### Implementation note
- Search is purely client-side — no API call needed, operates on the in-memory `board.tasks` array
- Matching is substring case-insensitive: `"stand"` matches `"Daily Standup"`

---

## 3. Assignee Filter

### Behavior
1. Click ⚡ icon → pill expands to filter chips (see above)
2. Click SL/KL/None to toggle them on/off
3. Filter logic (multi-select OR):
   - Nothing selected = show all tasks (same as All)
   - SL only = show tasks where `assignee === 'SL'`
   - KL only = show tasks where `assignee === 'KL'`
   - None only = show tasks where `assignee === undefined`
   - SL + KL = show SL or KL tasks
   - SL + None = show SL or unassigned tasks
   - KL + None = show KL or unassigned tasks
   - SL + KL + None = show all (same as nothing selected)
4. Board updates in real time — non-matching tasks dim to `opacity: 0.3`
5. Click × → filter deactivates, all tasks visible, pills collapse

### Search + filter interaction
- Both can be active simultaneously
- Tasks must match BOTH search AND filter to be fully visible
- Non-matching on either dimension = dimmed to 30%

---

## 4. Dark Mode

### Behavior
- Click ☾ toggle → switch between light and dark theme
- State persisted in `localStorage` key: `psyboard-theme`
- On load: check localStorage first; if absent, follow `prefers-color-scheme`
- Applied via `.dark` class on `<html>` element

### Dark theme (`.dark`)
| Element | Color |
|---------|-------|
| Background | `#0f172a` |
| Surface (cards) | `#1e293b` |
| Border | `#334155` |
| Text primary | `#f1f5f9` |
| Text muted | `#94a3b8` |
| Floating toolbar | `#1e293b` border `#334155` |
| Dark mode icon | 🌕 (full moon) — light mode |

### Light theme (default — no `.dark` class)
| Element | Color |
|---------|-------|
| Background | `#f8fafc` |
| Surface (cards) | `#ffffff` |
| Border | `#e2e8f0` |
| Text primary | `#1e293b` |
| Text muted | `#94a3b8` |
| Floating toolbar | `#ffffff` border `#e2e8f0` |
| Dark mode icon | 🌑 (new moon) — dark mode |

---

## 5. SSE Status Indicator

### Behavior
- Reads from existing `EventSource` in `App.tsx`
- When `es.readyState === EventSource.OPEN` or `CONNECTING`: green pulsing dot
  - Pulsing: CSS `@keyframes` animation, scale 1→1.3→1, `1.5s` infinite
- When `es.readyState === EventSource.CLOSED` or error: static red dot (`#ef4444`)
- Green = `background: #22c55e`; Red = `background: #ef4444`
- Dot is `8px` circle, no border, part of the icon button row

---

## 6. Full Screen

### Behavior
- Click ⊡ icon OR press `F` → call `document.documentElement.requestFullscreen()`
- `Escape` exits (native browser behavior)
- All toolbar features (search, filter, dark mode, SSE) remain functional in full screen
- Toolbar floats above full screen content at same position

---

## 7. Implementation Notes

### New files
- `client/src/components/HeaderToolbar.tsx` — floating toolbar component
- `client/src/hooks/useTheme.ts` — dark mode state + localStorage
- `client/src/hooks/useSearch.ts` — search state + filtering logic
- `client/src/hooks/useAssigneeFilter.ts` — filter state + filtering logic
- `client/src/styles/theme.css` — dark/light CSS variables

### Modified files
- `client/src/App.tsx` — render `<HeaderToolbar>` inside `<BoardView>` wrapper
- `client/src/components/TaskCard.tsx` — apply `opacity: 0.3` when task is dimmed by search/filter
- `client/src/index.css` — add `.dark` CSS variables

### SSE status integration
- `App.tsx` exposes `sseStatus` via a React context or callback prop
- `HeaderToolbar` reads status and renders the dot
- Status: `'connected' | 'connecting' | 'disconnected'`
