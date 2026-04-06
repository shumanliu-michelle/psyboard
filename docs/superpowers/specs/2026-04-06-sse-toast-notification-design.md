# SSE Toast Notification — Design Spec

## Context

When Home Assistant creates tasks via the HA sync endpoint, or when another browser tab makes a change, connected clients receive a `board_updated` SSE event and reload the board. Currently there is no user-facing feedback for these events — the board silently refreshes.

This spec adds a toast notification that summarizes what changed, auto-dismisses after 5 seconds, and works for all broadcast sources (HA, other tabs, future agents).

---

## Design Decisions

### Toast Position
- **Top-center** with slide-down animation
- Out of the way of the board content, immediately visible

### Toast Content

**Home Assistant sync:**
```
🏠 Home Assistant          +2
  + Refill S8 water tank
  + Roborock water low — top up
```

**Another browser tab (structured):**
```
🔄 Board updated          +1
  + Morning standup prep
```
When a tab makes an API change, the endpoint includes the created/updated task summary in the broadcast.

**Unknown / generic:**
```
🔄 Board updated in another tab
```
When `summary` is `null` (no structured data available).

### SSE Payload Change

`broadcast()` is updated to accept a structured summary:

```typescript
type BroadcastSummary =
  | { source: 'home_assistant'; created: string[]; skipped: string[] }
  | { source: 'tab'; created: Task[]; updated: Task[]; deleted: string[] }
  | { source: 'psyduck'; created: Task[]; completed: string[] }  // future
  | { source: 'cron'; created: string[]; message: string }       // future
  | null

broadcast(sourceTabId?: string, summary?: BroadcastSummary): void
```

SSE message format:
```json
{ "type": "board_updated", "tabId": null, "summary": { "source": "home_assistant", "created": ["Refill S8..."], "skipped": [] } }
```

When `summary` is `null`, the client renders a generic "Board updated" message.

---

## Implementation Plan

### Server-side changes

1. **`server/src/routes/events.ts`**
   - Update `broadcast()` signature to accept `summary?: BroadcastSummary`
   - SSE message includes `summary` JSON in payload
   - Type definition lives here (avoid circular import with `home-assistant`)

2. **`server/src/routes/tasks.ts`**
   - `POST /api/tasks` → call `broadcast(tabId, { source: 'tab', created: [newTask], updated: [], deleted: [] })`
   - `PATCH /api/tasks/:id` → call `broadcast(tabId, { source: 'tab', created: [], updated: [updatedTask], deleted: [] })`
   - `DELETE /api/tasks/:id` → call `broadcast(tabId, { source: 'tab', created: [], updated: [], deleted: [taskTitle] })`
   - `POST /api/tasks/reorder` → call `broadcast(tabId, null)` (order changes are cosmetic)

3. **`server/src/home-assistant/index.ts`**
   - Call `broadcast(undefined, { source: 'home_assistant', created, skipped })`
   - Pass the `created` and `skipped` string arrays through

### Client-side changes

4. **`client/src/App.tsx`**
   - SSE `onmessage` handler parses `data.summary`
   - Add `toast: { visible: boolean; summary: BroadcastSummary | null }` state
   - When `board_updated` is processed, set `toast` state from `data.summary`
   - Auto-dismiss with 5s timer (reset timer if a new toast arrives before dismissal)

5. **`client/src/components/Toast.tsx`** (new component)
   - Renders toast at top-center when `toast.visible === true`
   - Slide-down animation, auto-dismiss at 5s
   - `useEffect` with `setTimeout` to clear
   - Switches rendering based on `summary.source`:
     - `home_assistant` → 🏠, green +N badge, task title list
     - `tab` → 🔄, green +N badge, task title list
     - `null` → 🔄, generic "Board updated" text

6. **`client/src/App.tsx`** — render `<Toast summary={toast.summary} visible={toast.visible} />`

7. **`client/src/index.css`** — toast styles:
   - Position: fixed, top: 16px, left: 50%, transform: translateX(-50%)
   - Dark card (#1e293b), white text, rounded corners, box-shadow
   - Slide-down animation via CSS keyframes
   - Badge styles for created/skipped counts

---

## Component Inventory

### `<Toast summary={summary} visible={visible} />`

**Props:** `summary: BroadcastSummary | null`, `visible: boolean`

**States:**
- `visible=false` → renders nothing (null guard)
- `visible=true, summary.source='home_assistant'` → 🏠 icon, "Home Assistant" label, green `+N` badge, task title list (created), gray `~N skipped` badge if skipped > 0
- `visible=true, summary.source='tab'` → 🔄 icon, "Board updated" label, green `+N` badge (created), blue `~N` badge (updated), task title list
- `visible=true, summary=null` → 🔄 icon, generic "Board updated in another tab" text

**Animation:** CSS `@keyframes slideDown` — opacity 0→1, translateY -12px→0, 0.3s ease-out

**Styling:** Fixed top-center, z-index above board, box-shadow for elevation

---

## Testing

- Server: Add test for `broadcast()` with summary payload
- Server: Verify SSE message contains `summary` field for task create/update/delete
- Server: Verify HA check endpoint passes correct `created`/`skipped` arrays to broadcast
- Client: Unit test `<Toast>` rendering for each `source` variant
- Client: Verify timer cleanup on unmount

---

## File inventory

| File | Change |
|------|--------|
| `server/src/routes/events.ts` | Update `broadcast()` signature + SSE payload |
| `server/src/routes/tasks.ts` | Pass structured summary to `broadcast()` |
| `server/src/home-assistant/index.ts` | Pass `created`/`skipped` to `broadcast()` |
| `client/src/App.tsx` | Parse `summary` from SSE, manage toast state |
| `client/src/components/Toast.tsx` | New — toast rendering component |
| `client/src/index.css` | Toast styles + animations |
| `client/src/__tests__/Toast.test.tsx` | New — unit tests |
| `server/src/__tests__/events.test.ts` | Update for summary in SSE payload |
