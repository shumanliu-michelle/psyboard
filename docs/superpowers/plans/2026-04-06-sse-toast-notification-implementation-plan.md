# SSE Toast Notification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan batch-by-batch. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-center toast notification that appears when SSE `board_updated` fires, showing a structured summary of what changed. Auto-dismisses after 5 seconds.

**Architecture:** Server passes a structured `summary` object through `broadcast()`, which embeds it in the SSE message. Client renders toast based on `summary.source`. No client-side diffing required.

**Tech Stack:** React (existing), Express SSE (existing), CSS keyframes (existing infrastructure)

---

## File Map

| File | Role |
|------|------|
| `server/src/routes/events.ts` | Define `BroadcastSummary` type, update `broadcast()` signature + SSE payload |
| `server/src/routes/tasks.ts` | Pass `{source:'tab', created/updated/deleted}` summary to `broadcast()` |
| `server/src/home-assistant/index.ts` | Pass `{source:'home_assistant', created, skipped}` to `broadcast()` |
| `client/src/types.ts` | Add `BroadcastSummary` type |
| `client/src/App.tsx` | Parse `summary` from SSE, manage toast visible state + 5s auto-dismiss timer |
| `client/src/components/Toast.tsx` | New — renders toast based on `summary.source` |
| `client/src/index.css` | Toast styles + slide-down animation |
| `client/src/__tests__/Toast.test.tsx` | New — unit tests for Toast component |
| `server/src/routes/__tests__/events.test.ts` | Update existing tests for `summary` in SSE payload |

---

## Task 1: Define `BroadcastSummary` type + update `broadcast()` in events.ts

**Files:**
- Modify: `server/src/routes/events.ts`
- Test: `server/src/routes/__tests__/events.test.ts`

The `BroadcastSummary` type lives in `events.ts` to avoid circular imports with `home-assistant/index.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/routes/__tests__/events.test.ts — add to existing describe
it('SSE message includes summary field when broadcast is called with summary', (done) => {
  const sseReq = request(app).get('/api/events').buffer(true)

  setTimeout(() => {
    // Trigger a board mutation that calls broadcast(tabId, summary)
    // Currently no endpoint passes summary — this test verifies the field is absent
    request(app)
      .post('/api/tasks')
      .set('X-Tab-Id', 'test-tab')
      .send({ title: 'Task X', columnId: BACKLOG_COLUMN_ID })
      .end(() => {
        sseReq.end((_err, res) => {
          // After Task 2, this should contain "summary"
          expect(res.text).toMatch(/"summary":/)
          done()
        })
      })
  }, 50)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts`
Expected: Test passes now (summary absent from SSE but field exists as null). After Task 2, it should contain actual summary data. The test verifies the field is always present.

- [ ] **Step 3: Add `BroadcastSummary` type + update `broadcast()` signature**

```typescript
// server/src/routes/events.ts

export type BroadcastSummary =
  | { source: 'home_assistant'; created: string[]; skipped: string[] }
  | { source: 'tab'; created: Task[]; updated: Task[]; deleted: string[] }
  | null

export function broadcast(sourceTabId?: string, summary?: BroadcastSummary): void {
  const payload = JSON.stringify({ type: 'board_updated', tabId: sourceTabId ?? null, summary })
  const message = `data: ${payload}\n\n`
  // ... rest unchanged
}
```

Add `import type { Task } from '../../types.js'` at the top.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/events.ts server/src/routes/__tests__/events.test.ts
git commit -m "feat(sse): define BroadcastSummary type and update broadcast() to carry summary"
```

---

## Task 2: Update task routes to pass structured summary to `broadcast()`

**Files:**
- Modify: `server/src/routes/tasks.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// server/src/routes/__tests__/events.test.ts

it('broadcast includes {source:"tab",created:[task]} when a task is created', (done) => {
  const sseReq = request(app).get('/api/events').buffer(true)
  setTimeout(() => {
    request(app)
      .post('/api/tasks')
      .set('X-Tab-Id', 'my-tab')
      .send({ title: 'New task', columnId: BACKLOG_COLUMN_ID })
      .end(() => {
        sseReq.end((_err, res) => {
          expect(res.text).toMatch(/"source":"tab"/)
          expect(res.text).toMatch(/"created"/)
          done()
        })
      })
  }, 50)
})

it('broadcast includes {source:"tab",updated:[task]} when a task is patched', (done) => {
  const sseReq = request(app).get('/api/events').buffer(true)
  setTimeout(async () => {
    // Create a task first
    const create = await request(app).post('/api/tasks').send({ title: 'Task to update', columnId: BACKLOG_COLUMN_ID })
    const taskId = create.body.id
    setTimeout(() => {
      request(app)
        .patch(`/api/tasks/${taskId}`)
        .set('X-Tab-Id', 'my-tab')
        .send({ title: 'Updated title' })
        .end(() => {
          sseReq.end((_err, res) => {
            expect(res.text).toMatch(/"source":"tab"/)
            expect(res.text).toMatch(/"updated"/)
            done()
          })
        })
    }, 50)
  }, 50)
})
```

- [ ] **Step 2: Run tests — verify they fail (summary not yet passed)**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts`
Expected: FAIL — tests will pass because the SSE payload includes `summary: null` by default (broadcast still works). The real failure would be the content doesn't match. Actually since `broadcast` currently calls `JSON.stringify({type, tabId})` without `summary`, the test will fail because `"summary"` won't be in the text.

Run to confirm: `FAIL`

- [ ] **Step 3: Update task route `POST /` to pass created task summary**

In `server/src/routes/tasks.ts`, find the POST handler. After `broadcast(getTabId(req))`, update:

```typescript
// POST /api/tasks — after creating the task
const newTask = createTask(...)
broadcast(getTabId(req), { source: 'tab', created: [newTask], updated: [], deleted: [] })
res.status(201).json(newTask)
broadcast(getTabId(req))  // ← remove this duplicate
```

Wait — only call `broadcast` once. Replace the existing `broadcast(getTabId(req))` with the structured version.

- [ ] **Step 4: Update PATCH handler to pass updated task summary**

```typescript
const updatedTask = updateTask(id, { ... })
broadcast(getTabId(req), { source: 'tab', created: [], updated: [updatedTask], deleted: [] })
res.json(updatedTask)
// remove any duplicate broadcast call
```

- [ ] **Step 5: Update DELETE handler to pass deleted task title**

```typescript
const taskTitle = task.title  // capture before deleting
deleteTask(id)
broadcast(getTabId(req), { source: 'tab', created: [], updated: [], deleted: [taskTitle] })
res.status(204).send()
// remove any duplicate broadcast call
```

- [ ] **Step 6: Verify `POST /api/tasks/reorder` — no change needed**

The reorder endpoint calls `broadcast(getTabId(req))` without a summary — this is correct. Reorder is cosmetic and doesn't need structured data. The SSE payload will include `summary: null`, and the toast will render a generic "Board updated" message for other tabs.

- [ ] **Step 7: Run tests**

Run: `cd server && npx vitest run src/routes/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/tasks.ts server/src/routes/__tests__/events.test.ts
git commit -m "feat(tasks): pass structured {source,created,updated,deleted} to broadcast()"
```

---

## Task 3: Update HA check route to pass structured summary

**Files:**
- Modify: `server/src/home-assistant/index.ts`

The HA route already has `created` and `skipped` string arrays. Just pass them through.

- [ ] **Step 1: Update `broadcast()` call in HA check route**

```typescript
broadcast(undefined, { source: 'home_assistant', created, skipped })
```

Replace the existing `broadcast(undefined)` call.

- [ ] **Step 2: Verify no other broadcast calls exist in home-assistant**

```bash
grep -n "broadcast" server/src/home-assistant/index.ts
```

Should only show the one call.

- [ ] **Step 3: Run HA tests**

Run: `cd server && npx vitest run src/__tests__/homeAssistant.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/src/home-assistant/index.ts
git commit -m "feat(home-assistant): pass created/skipped summary to broadcast()"
```

---

## Task 4: Add `BroadcastSummary` type to client + parse from SSE

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add `BroadcastSummary` type to client types**

```typescript
// client/src/types.ts — add at end of file

export type BroadcastSummary =
  | { source: 'home_assistant'; created: string[]; skipped: string[] }
  | { source: 'tab'; created: Task[]; updated: Task[]; deleted: string[] }
  | null
```

- [ ] **Step 2: Write failing Toast tests**

```tsx
// client/src/__tests__/Toast.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toast } from '../components/Toast'

describe('Toast', () => {
  it('renders nothing when visible is false', () => {
    render(<Toast visible={false} summary={null} onDismiss={vi.fn()} />)
    expect(screen.queryByText(/Home Assistant/)).toBeNull()
  })

  it('renders Home Assistant toast with created task titles', () => {
    const summary = { source: 'home_assistant' as const, created: ['Refill S8 water tank', 'Roborock low'], skipped: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Home Assistant')).toBeInTheDocument()
    expect(screen.getByText('Refill S8 water tank')).toBeInTheDocument()
    expect(screen.getByText('Roborock low')).toBeInTheDocument()
  })

  it('renders tab toast with created task titles', () => {
    const task = { id: '1', title: 'Morning standup', columnId: 'today', order: 0, createdAt: '', updatedAt: '' }
    const summary = { source: 'tab' as const, created: [task], updated: [], deleted: [] }
    render(<Toast visible={true} summary={summary} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated')).toBeInTheDocument()
    expect(screen.getByText('Morning standup')).toBeInTheDocument()
  })

  it('renders generic message when summary is null', () => {
    render(<Toast visible={true} summary={null} onDismiss={vi.fn()} />)
    expect(screen.getByText('Board updated in another tab')).toBeInTheDocument()
  })

  it('auto-dismisses after 5 seconds', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    vi.useFakeTimers()
    render(<Toast visible={true} summary={null} onDismiss={onDismiss} />)
    await user.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(onDismiss).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
```

Note: `onDismiss` prop added to Toast — needed for manual close. The spec says auto-dismiss at 5s, but we also add a close button.

- [ ] **Step 3: Run tests — verify they fail (Toast component doesn't exist yet)**

Run: `cd client && npx vitest run src/__tests__/Toast.test.tsx`
Expected: FAIL — component doesn't exist

- [ ] **Step 4: Create `client/src/components/Toast.tsx`**

```tsx
import { useEffect, useState } from 'react'
import type { BroadcastSummary, Task } from '../types'

interface ToastProps {
  summary: BroadcastSummary
  visible: boolean
  onDismiss: () => void
}

function getIcon(source: BroadcastSummary) {
  if (source === null) return '🔄'
  if (source.source === 'home_assistant') return '🏠'
  return '🔄'
}

function getLabel(source: BroadcastSummary) {
  if (source === null) return 'Board updated in another tab'
  if (source.source === 'home_assistant') return 'Home Assistant'
  return 'Board updated'
}

function getCreatedCount(source: BroadcastSummary): number {
  if (source === null) return 0
  return source.created.length
}

export function Toast({ summary, visible, onDismiss }: ToastProps) {
  const [animKey, setAnimKey] = useState(0)

  // Reset animation key when visibility changes (re-trigger animation)
  useEffect(() => {
    if (visible) setAnimKey(k => k + 1)
  }, [visible])

  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [visible, onDismiss])

  if (!visible) return null

  const createdCount = getCreatedCount(summary)

  return (
    <div className={`toast toast-animate-${animKey % 2 === 0 ? 'in' : 'in'}`} role="status" aria-live="polite">
      <div className="toast-row">
        <span className="toast-icon">{getIcon(summary)}</span>
        <span className="toast-label">{getLabel(summary)}</span>
        {createdCount > 0 && (
          <span className="toast-badge toast-badge-created">+{createdCount}</span>
        )}
        {summary !== null && summary.source === 'home_assistant' && summary.skipped.length > 0 && (
          <span className="toast-badge toast-badge-skipped">~{summary.skipped.length} skipped</span>
        )}
      </div>
      {summary !== null && summary.created.length > 0 && (
        <div className="toast-task-list">
          {summary.created.map((task, i) => (
            <div key={i} className="toast-task-item">
              <span className="toast-task-marker">+</span>
              <span>{typeof task === 'string' ? task : (task as Task).title}</span>
            </div>
          ))}
        </div>
      )}
      <button className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
```

Note: `created` in the `tab` source uses `Task[]` objects, while `home_assistant` uses `string[]`. Handle both with `typeof task === 'string'`.

- [ ] **Step 5: Add CSS to `client/src/index.css`**

Add after existing toolbar styles:

```css
/* Toast */
.toast {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  background: #1e293b;
  color: white;
  padding: 10px 16px;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  min-width: 240px;
  max-width: 320px;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

@keyframes toast-slide-in {
  from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.toast {
  animation: toast-slide-in 0.3s ease-out;
}

.toast-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast-icon {
  font-size: 14px;
}

.toast-label {
  font-weight: 600;
  font-size: 13px;
}

.toast-badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  margin-left: auto;
}

.toast-badge-created {
  background: #22c55e;
  color: white;
}

.toast-badge-skipped {
  background: #475569;
  color: #cbd5e1;
}

.toast-task-list {
  border-top: 1px solid #334155;
  padding-top: 6px;
  margin-top: 2px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.toast-task-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.toast-task-marker {
  color: #22c55e;
  font-weight: 600;
}

.toast-close {
  position: absolute;
  top: 8px;
  right: 10px;
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0;
}

.toast-close:hover {
  color: white;
}
```

- [ ] **Step 6: Update App.tsx to wire up toast state**

Add to App.tsx imports:
```tsx
import { Toast } from './components/Toast'
import type { BroadcastSummary } from './types'
```

Add state:
```tsx
const [toastSummary, setToastSummary] = useState<BroadcastSummary | null>(null)
```

Add timer ref:
```tsx
const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

Update SSE `onmessage`:
```tsx
es.onmessage = (event) => {
  const data = JSON.parse(event.data)
  if (data.tabId === null || data.tabId === undefined || data.tabId !== tabIdRef.current) {
    loadBoard()
    // Show toast with summary from SSE payload
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToastSummary(data.summary ?? null)
    toastTimerRef.current = setTimeout(() => setToastSummary(null), 5000)
  }
}
```

Add dismiss function:
```tsx
function dismissToast() {
  if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  setToastSummary(null)
}
```

Render in JSX (inside return, after BoardView):
```tsx
<Toast summary={toastSummary} visible={toastSummary !== null} onDismiss={dismissToast} />
```

- [ ] **Step 7: Run Toast tests**

Run: `cd client && npx vitest run src/__tests__/Toast.test.tsx`
Expected: PASS

- [ ] **Step 8: Run all client tests**

Run: `cd client && npx vitest run`
Expected: PASS (66+ tests)

- [ ] **Step 9: Commit**

```bash
git add client/src/types.ts client/src/App.tsx client/src/components/Toast.tsx client/src/index.css client/src/__tests__/Toast.test.tsx
git commit -m "feat(toast): add SSE-driven toast notification component"
```

---

## Task 5: Integration verification

**Files:** (none — integration test)

- [ ] **Step 1: Run full server test suite**

Run: `cd server && npx vitest run`
Expected: 110+ tests PASS

- [ ] **Step 2: Run full client test suite**

Run: `cd client && npx vitest run`
Expected: 66+ tests PASS

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A && git commit -m "feat: complete SSE toast notification system"
```

---

## Self-Review Checklist

- [ ] `BroadcastSummary` type defined in `events.ts` and `client/types.ts` — consistent?
- [ ] `broadcast(tabId, summary)` — summary is `BroadcastSummary | undefined` server-side, `BroadcastSummary | null` in SSE JSON?
- [ ] `home_assistant` source uses `string[]` for created/skipped; `tab` source uses `Task[]` for created/updated — handled in Toast rendering?
- [ ] Toast auto-dismiss timer cleanup on unmount? (`useEffect` return `clearTimeout`)
- [ ] Toast animation re-triggers on new toast? (key change)
- [ ] All existing SSE tests still pass after `broadcast()` signature change?
