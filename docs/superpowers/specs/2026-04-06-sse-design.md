# SSE Implementation Design

## Goal

Server pushes `board_updated` events to connected clients so the board repaints in real-time when tasks are created or updated via external callers (psyduck agent, HA, any API tool).

## Architecture

### Server
- `GET /api/events` — SSE endpoint, keeps connection open per client
- `broadcast()` — writes `{"type":"board_updated"}` to all open SSE connections
- Routes check `?broadcast=` query param to decide whether to call `broadcast()`

### Client
- `EventSource('/api/events')` in App — receives events, calls `loadBoard()` on message
- Client API calls use `?broadcast=false` to skip SSE (avoids double repaint)

## API Design

### SSE Endpoint
```
GET /api/events
Headers: Content-Type: text/event-stream
Response: keeps connection open, sends: data: {"type":"board_updated"}\n\n
```

### Task Mutations

```
POST /api/tasks?broadcast=false  → create task, skip broadcast (client)
POST /api/tasks?broadcast=true  → create task, broadcast (external caller)
POST /api/tasks                  → create task, broadcast (default)

PATCH /api/tasks/:id?broadcast=false  → update task, skip broadcast (client)
PATCH /api/tasks/:id?broadcast=true   → update task, broadcast (external caller)
PATCH /api/tasks/:id                  → update task, broadcast (default)

DELETE /api/tasks/:id  → no broadcast (not needed for now)
```

Broadcast param defaults to `true` — safe default so any API caller without knowledge of SSE still triggers client repaints.

## Broadcast Integration

| Route | Broadcast |
|-------|-----------|
| `POST /api/tasks` | default: `true` |
| `PATCH /api/tasks/:id` | default: `true` |
| `DELETE /api/tasks/:id` | no broadcast |

## Client Integration

- `App.tsx` mounts an `EventSource` on component mount
- On SSE `message` event: calls `loadBoard()` to repaint
- All task mutation API calls include `?broadcast=false`
- EventSource auto-reconnects on drop

## Future Work (Out of Scope)
- Column mutation broadcasts
- Midnight cron (separate feature)
- HA webhook via `POST /api/tasks` (for now HA creates tasks directly via boardStore)

## Files to Create/Modify

| File | Change |
|------|--------|
| `server/src/routes/events.ts` | **New** — SSE endpoint + `broadcast()` helper |
| `server/src/index.ts` | Mount events router |
| `server/src/routes/tasks.ts` | Check `?broadcast` query param, call `broadcast()` |
| `client/src/App.tsx` | Add `EventSource` listener, pass `?broadcast=false` to task mutations |
| `client/src/api.ts` | Add `?broadcast=false` to relevant calls (or handle at call site) |

## Implementation Order
1. `server/src/routes/events.ts` — SSE endpoint + broadcast
2. Mount in `server/src/index.ts`
3. Wire broadcast into `server/src/routes/tasks.ts` with `?broadcast` param
4. Client `EventSource` in `App.tsx`
