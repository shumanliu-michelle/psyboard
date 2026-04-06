# Header Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Floating bottom-right toolbar with search, assignee filter, dark mode, fullscreen, and SSE status indicator. All features work in full screen mode.

**Architecture:** React context (`FilterContext`) holds search query and selected assignee filters. A `useTheme` hook manages dark mode + localStorage. SSE status is read in App and stored in the same context. `BoardView` reads context to pass `isDimmed` prop to `TaskCard`.

**Tech Stack:** React hooks, CSS custom properties, CSS `.dark` class, `localStorage`, native `requestFullscreen`, EventSource

---

## Task 1: Dark Mode CSS Variables

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Add dark theme CSS custom properties and `.dark` class**

Add to the end of `client/src/index.css`:

```css
/* === Dark Theme === */
.dark {
  --bg-board: #0f172a;
  --bg-card: #1e293b;
  --border-default: #334155;
  --text-primary: #f1f5f9;
  --text-muted: #94a3b8;
  --text-done: #64748b;
  --shadow-card: 0 2px 8px rgba(0,0,0,0.3);
  --shadow-drawer: -4px 0 24px rgba(0,0,0,0.4);
  --assignee-sl-bg: #1e1b4b;
  --assignee-sl-text: #c4b5fd;
  --assignee-kl-bg: #1e3a5f;
  --assignee-kl-text: #93c5fd;
}

.dark body {
  background: var(--bg-board);
}

.dark .board {
  background: var(--bg-board);
}

.dark .column {
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
}

.dark .task-card {
  background: var(--bg-card);
  border-color: var(--border-default);
}

.dark .column-header h3 {
  color: var(--text-primary);
}

.dark .task-count {
  color: var(--text-muted);
}

.dark .task-card-title {
  color: var(--text-primary);
}

.dark .task-description {
  color: var(--text-muted);
}

.dark .task-card.done {
  background: #1e293b;
  opacity: 0.7;
  border-color: #334155;
}

.dark .task-card.done .task-card-title {
  color: #64748b;
}

.dark .task-drawer {
  background: #1e293b;
  box-shadow: var(--shadow-drawer);
}

.dark .task-drawer-header {
  border-color: #334155;
}

.dark .task-drawer-header h2 {
  color: var(--text-primary);
}

.dark .task-drawer-close {
  color: #64748b;
}

.dark .task-drawer-close:hover {
  background: #334155;
  color: var(--text-muted);
}

.dark .drawer-overlay {
  background: rgba(0, 0, 0, 0.6);
}

.dark .add-task-btn {
  color: #64748b;
}

.dark .add-form {
  background: #0f172a;
}

.dark .add-form input {
  background: #334155;
  border-color: #475569;
  color: var(--text-primary);
}

.dark .add-column-btn {
  border-color: #334155;
  color: #64748b;
}

.dark .add-column-btn:hover {
  border-color: var(--accent-backlog);
  color: var(--accent-backlog);
  background: var(--assignee-sl-bg);
}

.dark .column-delete {
  color: #475569;
}

.dark .column-delete:hover {
  background: #334155;
  color: #94a3b8;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add dark theme CSS custom properties"
```

---

## Task 2: useTheme Hook

**Files:**
- Create: `client/src/hooks/useTheme.ts`

- [ ] **Step 1: Write the useTheme hook**

Create `client/src/hooks/useTheme.ts`:

```typescript
import { useState, useEffect } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'psyboard-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark') return 'dark'
  if (stored === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  function toggleTheme() {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }

  return { theme, toggleTheme }
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/hooks/useTheme.ts
mkdir -p client/src/hooks && git commit -m "feat: add useTheme hook for dark mode"
```

---

## Task 3: FilterContext (Search + Assignee Filter State)

**Files:**
- Create: `client/src/context/FilterContext.tsx`
- Create: `client/src/hooks/useTaskFilter.ts`

- [ ] **Step 1: Write FilterContext**

Create `client/src/context/FilterContext.tsx`:

```typescript
import { createContext, useContext, useState, useMemo, type ReactNode } from 'react'
import type { Task } from '../types'

export type AssigneeFilter = Set<'SL' | 'KL' | 'none'>

type ExpandedMode = 'search' | 'filter' | null

interface FilterContextValue {
  // Expanded toolbar state
  expanded: ExpandedMode
  setExpanded: (mode: ExpandedMode) => void

  // Search
  searchQuery: string
  setSearchQuery: (q: string) => void

  // Assignee filter (multi-select)
  assigneeFilter: AssigneeFilter
  toggleAssignee: (a: 'SL' | 'KL' | 'none') => void

  // Derived: is a task dimmed?
  isTaskDimmed: (task: Task) => boolean

  // Matching count for search badge
  matchingCount: number
}

const FilterContext = createContext<FilterContextValue | null>(null)

interface FilterProviderProps {
  children: ReactNode
  tasks: Task[]
}

export function FilterProvider({ children, tasks }: FilterProviderProps) {
  const [expanded, setExpanded] = useState<ExpandedMode>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>(new Set())

  function toggleAssignee(a: 'SL' | 'KL' | 'none') {
    setAssigneeFilter(prev => {
      const next = new Set(prev)
      if (next.has(a)) next.delete(a)
      else next.add(a)
      return next
    })
  }

  const { isTaskDimmed, matchingCount } = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const hasFilter = assigneeFilter.size > 0
    const hasSearch = query.length > 0

    const matching = tasks.filter(task => {
      const matchesSearch = !hasSearch || task.title.toLowerCase().includes(query)
      const matchesAssignee = !hasFilter || (
        assigneeFilter.has('SL') && task.assignee === 'SL' ||
        assigneeFilter.has('KL') && task.assignee === 'KL' ||
        assigneeFilter.has('none') && task.assignee === undefined
      )
      return matchesSearch && matchesAssignee
    })

    const matchingSet = new Set(matching.map(t => t.id))
    const matchingCount = matching.length

    const isTaskDimmed = (task: Task) => !matchingSet.has(task.id)

    return { isTaskDimmed, matchingCount }
  }, [searchQuery, assigneeFilter, tasks])

  return (
    <FilterContext.Provider value={{
      expanded, setExpanded,
      searchQuery, setSearchQuery,
      assigneeFilter, toggleAssignee,
      isTaskDimmed,
      matchingCount,
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilterContext(): FilterContextValue {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilterContext must be used inside FilterProvider')
  return ctx
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/context/FilterContext.tsx
mkdir -p client/src/context && git commit -m "feat: add FilterContext for search and assignee filter state"
```

---

## Task 4: HeaderToolbar Component

**Files:**
- Create: `client/src/components/HeaderToolbar.tsx`

- [ ] **Step 1: Write the HeaderToolbar component**

Create `client/src/components/HeaderToolbar.tsx`:

```typescript
import { useRef } from 'react'
import { useFilterContext } from '../context/FilterContext'
import { useTheme } from '../hooks/useTheme'

type SseStatus = 'connected' | 'connecting' | 'disconnected'

interface HeaderToolbarProps {
  sseStatus: SseStatus
}

export function HeaderToolbar({ sseStatus }: HeaderToolbarProps) {
  const {
    expanded, setExpanded,
    searchQuery, setSearchQuery,
    assigneeFilter, toggleAssignee,
    matchingCount,
  } = useFilterContext()
  const { theme, toggleTheme } = useTheme()
  const searchInputRef = useRef<HTMLInputElement>(null)

  const isSearchOpen = expanded === 'search'
  const isFilterOpen = expanded === 'filter'

  function handleSearchToggle() {
    if (isSearchOpen) {
      setExpanded(null)
      setSearchQuery('')
    } else {
      setExpanded('search')
      setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }

  function handleFilterToggle() {
    if (isFilterOpen) {
      setExpanded(null)
    } else {
      setExpanded('filter')
    }
  }

  function handleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(console.error)
    } else {
      document.exitFullscreen().catch(console.error)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setExpanded(null)
      setSearchQuery('')
    }
    if (e.key === 'f' || e.key === 'F') {
      if (!isSearchOpen && !isFilterOpen && document.activeElement?.tagName !== 'INPUT') {
        handleFullscreen()
      }
    }
  }

  // Determine dark mode icon
  const darkModeIcon = theme === 'dark' ? '🌕' : '🌑'

  return (
    <div
      className="header-toolbar"
      onKeyDown={handleKeyDown}
      role="toolbar"
      aria-label="Board toolbar"
    >
      {/* Collapsed state */}
      {!isSearchOpen && !isFilterOpen && (
        <div className="toolbar-row">
          <button
            className="toolbar-btn"
            onClick={handleSearchToggle}
            aria-label="Search tasks"
            title="Search (type to activate)"
          >
            🔍
          </button>
          <button
            className="toolbar-btn"
            onClick={handleFilterToggle}
            aria-label="Filter by assignee"
            title="Filter"
          >
            👤
          </button>
          <button
            className="toolbar-btn"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            title="Toggle dark mode"
          >
            {darkModeIcon}
          </button>
          <button
            className="toolbar-btn"
            onClick={handleFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
          >
            🔲
          </button>
          <SseDot status={sseStatus} />
        </div>
      )}

      {/* Search expanded */}
      {isSearchOpen && (
        <div className="toolbar-expanded">
          <input
            ref={searchInputRef}
            type="text"
            className="toolbar-search-input"
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search tasks"
          />
          {searchQuery.trim() && (
            <span className="toolbar-count">{matchingCount} task{matchingCount !== 1 ? 's' : ''}</span>
          )}
          <button
            className="toolbar-close"
            onClick={() => { setExpanded(null); setSearchQuery('') }}
            aria-label="Close search"
          >
            ×
          </button>
        </div>
      )}

      {/* Filter expanded */}
      {isFilterOpen && (
        <div className="toolbar-expanded">
          <span className="toolbar-filter-label">Filter:</span>
          <button
            className={`filter-chip ${assigneeFilter.has('SL') ? 'selected' : ''}`}
            data-assignee="SL"
            onClick={() => toggleAssignee('SL')}
            aria-pressed={assigneeFilter.has('SL')}
          >
            SL
          </button>
          <button
            className={`filter-chip ${assigneeFilter.has('KL') ? 'selected' : ''}`}
            data-assignee="KL"
            onClick={() => toggleAssignee('KL')}
            aria-pressed={assigneeFilter.has('KL')}
          >
            KL
          </button>
          <button
            className={`filter-chip ${assigneeFilter.has('none') ? 'selected' : ''}`}
            data-assignee="none"
            onClick={() => toggleAssignee('none')}
            aria-pressed={assigneeFilter.has('none')}
          >
            None
          </button>
          <button
            className="toolbar-close"
            onClick={() => setExpanded(null)}
            aria-label="Close filter"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

function SseDot({ status }: { status: SseStatus }) {
  const color = status === 'disconnected' ? '#ef4444' : '#22c55e'
  const pulse = status === 'connecting' || status === 'connected' ? 'sse-pulse' : ''
  return (
    <span
      className={`sse-dot ${pulse}`}
      aria-label={`SSE ${status}`}
      title={`Connection: ${status}`}
    />
  )
}
```

- [ ] **Step 2: Add HeaderToolbar CSS to index.css**

Add to the end of `client/src/index.css`:

```css
/* === Header Toolbar === */
.header-toolbar {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
  font-size: 13px;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 8px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.toolbar-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f1f5f9;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s;
}

.dark .toolbar-btn {
  background: #334155;
}

.toolbar-btn:hover {
  background: #e2e8f0;
}

.dark .toolbar-btn:hover {
  background: #475569;
}

.sse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
  display: inline-block;
  flex-shrink: 0;
  align-self: center;
}

.sse-dot.sse-pulse {
  background: #22c55e;
  animation: sse-pulse 1.5s ease-in-out infinite;
}

@keyframes sse-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.8; }
}

/* Expanded search */
.toolbar-expanded {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  padding: 8px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.toolbar-search-input {
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  width: 180px;
  background: transparent;
}

.toolbar-search-input::placeholder {
  color: var(--text-muted);
}

.dark .toolbar-search-input {
  color: var(--text-primary);
}

.toolbar-count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  padding-right: 4px;
}

.toolbar-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  font-size: 16px;
  padding: 0;
  line-height: 1;
  flex-shrink: 0;
}

.toolbar-close:hover {
  color: var(--text-primary);
}

/* Filter chips */
.toolbar-filter-label {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.filter-chip {
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid transparent;
  background: transparent;
  transition: all 0.15s;
}

/* SL chip */
button.filter-chip[data-assignee="SL"]:not(.selected) {
  color: #c4b5fd;
  border-color: #6366f1;
}
button.filter-chip[data-assignee="SL"].selected {
  background: #fdf2f8;
  color: #ec4899;
  border-color: #f9a8d4;
}

/* KL chip */
button.filter-chip[data-assignee="KL"]:not(.selected) {
  color: #93c5fd;
  border-color: #93c5fd;
}
button.filter-chip[data-assignee="KL"].selected {
  background: #dbeafe;
  color: #1e40af;
  border-color: #93c5fd;
}

/* None chip */
button.filter-chip[data-assignee="none"]:not(.selected) {
  color: #fcd34d;
  border-color: #fcd34d;
}
button.filter-chip[data-assignee="none"].selected {
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/HeaderToolbar.tsx client/src/index.css
git commit -m "feat: add HeaderToolbar component with search and filter"
```

---

## Task 5: Integrate into App — SSE Status + FilterContext

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Update App.tsx to wire up SSE status and FilterContext**

Replace the content of `client/src/App.tsx` with:

```typescript
import { useEffect, useState, useRef } from 'react'
import type { Board } from './types'
import { BoardView } from './components/BoardView'
import { HeaderToolbar } from './components/HeaderToolbar'
import { FilterProvider } from './context/FilterContext'
import { api, setTabId } from './api'

const TAB_ID = Math.random().toString(36).slice(2, 10)

export default function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sseStatus, setSseStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')
  const tabIdRef = useRef(TAB_ID)

  async function loadBoard() {
    try {
      const data = await api.getBoard()
      setBoard(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTabId(TAB_ID)
    loadBoard()
  }, [])

  useEffect(() => {
    const es = new EventSource(`/api/events?tabId=${tabIdRef.current}`)
    setSseStatus('connecting')

    es.onopen = () => setSseStatus('connected')
    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log(`[SSE] Received board_updated (source: ${data.tabId ?? 'null'}, mine: ${tabIdRef.current})`)
      if (data.tabId && data.tabId !== tabIdRef.current) {
        console.log(`[SSE] Processing board_updated — triggering refresh`)
        loadBoard()
      } else {
        console.log(`[SSE] Ignoring board_updated — same tab`)
      }
    }
    es.onerror = () => setSseStatus('disconnected')
    return () => {
      es.close()
    }
  }, [])

  if (loading) {
    return <div style={{ padding: 24, color: '#666' }}>Loading...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#c00' }}>
        <strong>Error:</strong> {error}
        <br />
        <button onClick={loadBoard} style={{ marginTop: 8 }}>
          Retry
        </button>
      </div>
    )
  }

  if (!board) return null

  return (
    <FilterProvider tasks={board.tasks}>
      <BoardView board={board} onRefresh={loadBoard} />
      <HeaderToolbar sseStatus={sseStatus} />
    </FilterProvider>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/App.tsx
git commit -m "feat: wire FilterContext and SSE status into App"
```

---

## Task 6: TaskCard Dimmed State

**Files:**
- Modify: `client/src/components/TaskCard.tsx`

- [ ] **Step 1: Update TaskCard to consume FilterContext and apply dimmed class**

In `client/src/components/TaskCard.tsx`, add the FilterContext import and `useFilterContext`:

```typescript
import { useFilterContext } from '../context/FilterContext'
```

Inside the `TaskCard` function (after the existing `useState` hooks), add:

```typescript
const { isTaskDimmed } = useFilterContext()
const dimmed = isTaskDimmed(task)
```

In the outer `div` style, add `opacity: dimmed ? 0.3 : 1` to the existing style object:

```typescript
style={{
  ...style,
  display: 'flex',
  opacity: dimmed ? 0.3 : 1,
  // ... rest of style
}}
```

In the outer `div` className, add `' dimmed'` when dimmed:

```typescript
className={`task-card${isDragging ? ' dragging' : ''}${isCompleted ? ' done' : ''}${dimmed ? ' dimmed' : ''}`}
```

Also add the `dimmed` CSS to `index.css` — add after the `.done` styles:

```css
/* Dimmed state (search/filter) */
.task-card.dimmed {
  opacity: 0.3;
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/TaskCard.tsx client/src/index.css
git commit -m "feat: apply dimmed state to TaskCard based on search/filter"
```

---

## Task 7: Keyboard Shortcut — F for Fullscreen

**Files:**
- Modify: `client/src/components/HeaderToolbar.tsx` (already handled in Task 4)

The `handleKeyDown` in HeaderToolbar already handles `F` to toggle fullscreen when no input is focused. No additional changes needed.

- [ ] **Step 1: Verify the keyboard shortcut is wired correctly**

The `HeaderToolbar` component has `onKeyDown={handleKeyDown}` on the root div, which fires for all key events when the toolbar is mounted. The `F` key check already guards against firing when an input is focused.

- [ ] **Step 2: Commit (if any changes were needed)**

If no changes needed, skip commit — this task is informational.

---

## Task 8: Full Integration Test

**Files:**
- No file changes

- [ ] **Step 1: Run client tests**

```bash
cd /Users/shumanliu/Projects/psyboard/client && npm test -- run 2>&1 | tail -20
```

Expected: All tests pass (existing TaskDrawer failure is pre-existing, not introduced by this work)

- [ ] **Step 2: Manually verify in browser**

1. Open the app — floating toolbar should appear bottom-right
2. Click 🔍 → input appears, type to filter tasks
3. Click × → toolbar collapses
4. Click 👤 → SL/KL/None chips appear, click to toggle
5. Click 🌑 → dark mode toggles, theme persists on reload
6. Press F → fullscreen activates, press Escape to exit
7. SSE dot should be green when connected

- [ ] **Step 3: Commit**

```bash
git status
git add -A
git commit -m "feat: add floating header toolbar — search, filter, dark mode, fullscreen, SSE status"
```
