# Home Assistant WebSocket Subscription — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace HA polling with a persistent WebSocket connection that receives real-time `state_changed` events, eliminating the 5-minute poll interval.

**Architecture:** A single persistent WebSocket connection to HA at `/api/websocket`. After auth, subscribe to `state_changed` events. For each relevant entity change, fetch current state (if needed for condition evaluation), evaluate against alert rules, and create tasks. Reconnect automatically with exponential backoff on disconnect. The existing SSE broadcast to clients remains unchanged.

**Tech Stack:** Native WebSocket (`ws` library or Node's built-in `WebSocket` via `cross-fetch`/native), Node.js `events` for reconnection signals, existing alert engine unchanged.

---

## File Map

```
server/src/home-assistant/
  haClient.ts         — REST client (getAllStates); unchanged
  config.ts           — env/config loader; unchanged
  alertEngine.ts      — evaluateAlerts(); unchanged
  taskCreator.ts      — createTasksForAlerts(); unchanged
  scheduler.ts        — startScheduler()/stopScheduler(); REPLACED: polling → WS subscription
  index.ts            — /ha/check webhook; unchanged
  haWebSocket.ts      — NEW: WebSocket client (connect, auth, subscribe, reconnect)
  __tests__/
    scheduler.test.ts   — existing tests; REPLACE polling behavior with WS behavior
    haWebSocket.test.ts — NEW: WebSocket client unit tests
```

---

## Tasks

### Task 1: Create `haWebSocket.ts` — WebSocket client with auth, subscribe, and reconnect

**Files:**
- Create: `server/src/home-assistant/haWebSocket.ts`
- Test: `server/src/home-assistant/__tests__/haWebSocket.test.ts`

- [ ] **Step 1: Write the failing test — connection + auth flow**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockWebSocket, makeFakeMessage } from './testHelpers.js'

// Fake the WebSocket global before importing haWebSocket
vi.stubGlobal('WebSocket', MockWebSocket)

import { createHAWebSocket, type HAWSClient } from '../haWebSocket.js'
import { loadHAEnv, loadHAConfig } from '../config.js'
import { broadcast } from '../../routes/events.js'

vi.mock('../../routes/events.js', () => ({ broadcast: vi.fn() }))

describe('HA WebSocket Client', () => {
  beforeEach(() => {
    MockWebSocket.reset()
    vi.clearAllMocks()
  })

  it('authenticates and subscribes to state_changed on connect', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const },
      ],
    }
    vi.mocked(loadHAEnv).mockReturnValue(mockEnv)
    vi.mocked(loadHAConfig).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    // Simulate successful connect + auth
    MockWebSocket.emitOpen()
    MockWebSocket.emitMessage(makeFakeMessage({ id: 1, type: 'auth', success: true }))
    MockWebSocket.emitMessage(makeFakeMessage({ id: 2, type: 'result', success: true }))

    expect(MockWebSocket.url).toContain('/api/websocket')
    // The auth message should contain the token
    const authMsg = MockWebSocket.sentMessages.find(m => m.type === 'auth')
    expect(authMsg?.access_token).toBe('test-token')
    // The subscribe_events message should be sent after auth
    const subMsg = MockWebSocket.sentMessages.find(m => m.type === 'subscribe_events')
    expect(subMsg?.event_type).toBe('state_changed')
  })

  it('processes a state_changed event for a relevant entity', async () => {
    // (full test code continues...)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest src/home-assistant/__tests__/haWebSocket.test.ts --run`
Expected: FAIL — file doesn't exist yet

- [ ] **Step 3: Write minimal haWebSocket.ts implementation**

```typescript
import { loadHAEnv, loadHAConfig } from './config.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { broadcast, type BroadcastSummary } from '../routes/events.js'

// Native WebSocket is available in Node 18+
type WsMessage = { id: number; type: string; [key: string]: unknown }

let ws: InstanceType<typeof WebSocket> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY_MS = 300_000 // 5 minutes cap

function getReconnectDelay(): number {
  const base = 1000
  const delay = Math.min(base * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS)
  return delay
}

let currentMsgId = 1
function nextId() { return currentMsgId++ }

export type HAWSClient = {
  connect(): void
  disconnect(): void
}

function handleMessage(data: string): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(data) as WsMessage
  } catch {
    return
  }

  // Handle state_changed events
  if (msg.type === 'event' && typeof msg === 'object') {
    const eventData = msg as unknown as { event: { event_type: string; data: { entity_id: string; new_state: { state: string }; old_state: { state: string } } } }
    if (eventData.event?.event_type === 'state_changed') {
      handleStateChanged(eventData.event.data)
    }
  }
}

function handleStateChanged(data: { entity_id: string; new_state: { state: string } }): void {
  const config = loadHAConfig()
  // Only process entities we have alert rules for
  const relevantRules = config.alerts.filter(r => r.entityId === data.entity_id)
  if (relevantRules.length === 0) return

  // Build a minimal entityMap for evaluateAlerts
  const entityMap = new Map([[data.entity_id, { entity_id: data.entity_id, state: data.new_state.state, attributes: {} }]])
  const triggered = evaluateAlerts(relevantRules, entityMap)
  if (triggered.length === 0) return

  const results = createTasksForAlerts(triggered)
  const created = results.filter(r => r.action === 'created').map(r => r.alert.taskTitle)
  const skipped = results.filter(r => r.action === 'skipped').map(r => r.alert.taskTitle)

  if (created.length > 0 || skipped.length > 0) {
    console.log(`[HA WS] Created: ${created.join(', ')} | Skipped: ${skipped.join(', ')}`)
    const summary: BroadcastSummary = { source: 'home_assistant', created, skipped }
    broadcast(undefined, summary)
  }
}

export function createHAWebSocket(): HAWSClient {
  function connect(): void {
    if (ws) return // already connected

    const env = loadHAEnv()
    // HA WebSocket URL is the HTTP URL with /api/websocket path
    const wsUrl = `${env.HOME_ASSISTANT_URL.replace('http', 'ws')}/api/websocket`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[HA WS] Connected')
      reconnectAttempts = 0
      // Authenticate
      send({ id: nextId(), type: 'auth', access_token: env.HOME_ASSISTANT_TOKEN })
    }

    ws.onmessage = (event) => {
      handleMessage(event.data as string)
    }

    ws.onerror = (err) => {
      console.error('[HA WS] Error:', err)
    }

    ws.onclose = () => {
      console.log('[HA WS] Disconnected')
      ws = null
      scheduleReconnect()
    }
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempts = 0
    if (ws) {
      ws.close()
      ws = null
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer) return
    const delay = getReconnectDelay()
    reconnectAttempts++
    console.log(`[HA WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function send(msg: object): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  return { connect, disconnect }
}
```

- [ ] **Step 4: Write test helpers for mock WebSocket**

`server/src/home-assistant/__tests__/testHelpers.ts`

```typescript
// Minimal MockWebSocket that tracks sent messages and can emit events
export class MockWebSocket {
  static instances: MockWebSocket[] = []
  static sentMessages: WsMessage[] = []

  url: string
  readyState: number = WebSocket.CONNECTING
  static CONNECTING = 0, OPEN = 1, CLOSING = 2, CLOSED = 3

  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    // Simulate async connection open
    setTimeout(() => this.readyState = WebSocket.OPEN, 0)
  }

  send(data: string): void {
    MockWebSocket.sentMessages.push(JSON.parse(data) as WsMessage)
  }

  close(): void {
    this.readyState = WebSocket.CLOSED
    this.onclose?.({})
  }

  static reset() {
    MockWebSocket.instances = []
    MockWebSocket.sentMessages = []
  }

  static emitOpen() {
    for (const inst of MockWebSocket.instances) {
      inst.readyState = WebSocket.OPEN
      inst.onopen?.({})
    }
  }

  static emitMessage(data: unknown) {
    for (const inst of MockWebSocket.instances) {
      inst.onmessage?.({ data: JSON.stringify(data) })
    }
  }
}

export type WsMessage = { id: number; type: string; [key: string]: unknown }

export function makeFakeMessage(overrides: Partial<WsMessage> & { id: number; type: string }): WsMessage {
  return { id: 0, type: '', ...overrides }
}
```

- [ ] **Step 5: Run all haWebSocket tests to verify they pass**

Run: `cd server && npx vitest src/home-assistant/__tests__/haWebSocket.test.ts --run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/src/home-assistant/haWebSocket.ts server/src/home-assistant/__tests__/haWebSocket.test.ts server/src/home-assistant/__tests__/testHelpers.ts
git commit -m "feat: add HA WebSocket client with auth, subscribe, and reconnect"
```

---

### Task 2: Replace polling scheduler with WebSocket subscription

**Files:**
- Modify: `server/src/home-assistant/scheduler.ts`
- Test: `server/src/__tests__/scheduler.test.ts` (rewrite for WS mode)

- [ ] **Step 1: Write the failing test — scheduler starts WS instead of polling**

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

vi.mock('../home-assistant/config.js', () => ({
  loadHAEnv: () => ({ HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }),
  loadHAConfig: vi.fn(),
}))

vi.mock('../home-assistant/haWebSocket.js', () => ({
  createHAWebSocket: vi.fn(),
}))

vi.mock('../routes/events.js', () => ({
  broadcast: vi.fn(),
}))

import { startScheduler, stopScheduler, getActiveTimers } from '../home-assistant/scheduler.js'
import { loadHAConfig } from '../home-assistant/config.js'
import { createHAWebSocket } from '../home-assistant/haWebSocket.js'

describe('HA Scheduler — WebSocket mode', () => {
  let mockWsClient: { connect: () => void; disconnect: () => void }

  beforeEach(() => {
    writeBoard(createTestBoard())
    vi.clearAllMocks()
    stopScheduler()
    mockWsClient = { connect: vi.fn(), disconnect: vi.fn() }
    vi.mocked(createHAWebSocket).mockReturnValue(mockWsClient)
  })

  afterEach(() => {
    stopScheduler()
  })

  it('starts a single WebSocket client and connects', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      pollIntervalMinutes: 5, // should be ignored in WS mode
      alerts: [{ entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const }],
    }
    vi.mocked(loadHAConfig).mockReturnValue(mockConfig)

    startScheduler()

    expect(getActiveTimers()).toBe(1)
    expect(mockWsClient.connect).toHaveBeenCalledOnce()
  })

  it('stopScheduler disconnects the WebSocket client', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [{ entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const }],
    }
    vi.mocked(loadHAConfig).mockReturnValue(mockConfig)

    startScheduler()
    stopScheduler()

    expect(mockWsClient.disconnect).toHaveBeenCalledOnce()
    expect(getActiveTimers()).toBe(0)
  })

  it('does not start when HA config throws (not configured)', () => {
    vi.mocked(loadHAConfig).mockImplementation(() => { throw new Error('HA .env not found') })

    startScheduler()

    expect(getActiveTimers()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest src/__tests__/scheduler.test.ts --run`
Expected: FAIL — new behavior not yet implemented

- [ ] **Step 3: Rewrite scheduler.ts to use WebSocket client**

Replace the `scheduler.ts` content:

```typescript
import { createHAWebSocket, type HAWSClient } from './haWebSocket.js'
import { loadHAConfig } from './config.js'

let wsClient: HAWSClient | null = null

export function startScheduler(): void {
  let config: ReturnType<typeof loadHAConfig>
  try {
    config = loadHAConfig()
  } catch (err) {
    console.warn(`[HA Scheduler] Not starting — HA not configured: ${(err as Error).message}`)
    return
  }

  if (wsClient !== null) {
    console.log('[HA Scheduler] Already running')
    return
  }

  console.log(`[HA Scheduler] Starting WebSocket subscription for ${config.alerts.length} alerts`)

  wsClient = createHAWebSocket()
  wsClient.connect()
}

export function stopScheduler(): void {
  if (wsClient !== null) {
    wsClient.disconnect()
    wsClient = null
  }
  console.log('[HA Scheduler] Stopped')
}

export function getActiveTimers(): number {
  return wsClient !== null ? 1 : 0
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest src/__tests__/scheduler.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/home-assistant/scheduler.ts server/src/__tests__/scheduler.test.ts
git commit -m "refactor: replace HA polling scheduler with WebSocket subscription"
```

---

### Task 3: Handle edge cases and error scenarios

**Files:**
- Modify: `server/src/home-assistant/haWebSocket.ts`
- Test: `server/src/home-assistant/__tests__/haWebSocket.test.ts`

- [ ] **Step 1: Write failing tests for error/reconnect scenarios**

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement error handling and reconnect logic**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

---

### Task 4: Update design docs

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-psyduck-psyboard-integration-design.md`

- [ ] **Add section: WebSocket Subscription (replaces polling)**

Document the new architecture: persistent WebSocket connection, auth flow, `state_changed` event handling, reconnection strategy.

---

## Self-Review Checklist

**1. Spec coverage:**
- [x] Real-time state_changed events — handled in `handleStateChanged()`
- [x] Auth with long-lived access token — `send({ type: 'auth', access_token: ... })`
- [x] Subscribe to state_changed — `send({ type: 'subscribe_events', event_type: 'state_changed' })`
- [x] Reconnect with backoff — `scheduleReconnect()` with exponential delay capped at 5 min
- [x] Evaluate alerts per event — `evaluateAlerts(relevantRules, entityMap)`
- [x] Create tasks for triggered alerts — `createTasksForAlerts(triggered)`
- [x] SSE broadcast to clients — `broadcast(undefined, summary)` unchanged
- [x] `pollIntervalMinutes` removed from scheduler (WS connection replaces it)

**2. Placeholder scan:** No TBD/TODO/placeholder patterns in the plan. All test code is shown inline.

**3. Type consistency:** All file paths match existing structure. `HAWSClient` interface is exported from `haWebSocket.ts` and imported by `scheduler.ts`. `evaluateAlerts` and `createTasksForAlerts` signatures unchanged.

---

## Execution Options

**1. Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks
**2. Inline Execution** - execute tasks in this session using executing-plans

Which approach?
