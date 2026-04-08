import { loadHAEnv, loadHAConfig } from './config.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { broadcast, type BroadcastSummary } from '../routes/events.js'

type WsMessage = { id: number; type: string; [key: string]: unknown }

let ws: InstanceType<typeof WebSocket> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY_MS = 300_000

// Cached config — loaded lazily on first use (avoids module-init timing issues with mocks)
let _cachedConfig: ReturnType<typeof loadHAConfig> | null = null
function getConfig() {
  if (!_cachedConfig) {
    _cachedConfig = loadHAConfig()
  }
  return _cachedConfig
}

function getReconnectDelay(): number {
  const base = 1000
  return Math.min(base * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS)
}

let currentMsgId = 1
function nextId() { return currentMsgId++ }

// Reset module-level state — used by tests to isolate between runs
function resetState(): void {
  ws = null
  reconnectTimer = null
  reconnectAttempts = 0
  currentMsgId = 1
  _intentionalDisconnect = false
  _cachedConfig = null
}

let _intentionalDisconnect = false

export type HAWSClient = {
  connect(): void
  disconnect(): void
}

// For testing: reset all module-level state between test runs
export function resetHAWSState(): void {
  resetState()
}

function send(msg: object): void {
  const socket = ws
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}

function handleMessage(data: string): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(data) as WsMessage
  } catch {
    console.warn('[HA WS] Failed to parse message:', data)
    return
  }

  // Handle auth flow: server tells us to authenticate, we send auth, server confirms, we subscribe
  if (msg.type === 'auth_required') {
    const env = loadHAEnv()
    console.log('[HA WS] Sending auth')
    // Note: auth message must NOT include an id field — HA rejects extra keys
    send({ type: 'auth', access_token: env.HOME_ASSISTANT_TOKEN })
    return
  }

  if (msg.type === 'auth_success' || msg.type === 'auth_ok') {
    // Auth succeeded — subscribe to state_changed events
    reconnectAttempts = 0
    console.log('[HA WS] Auth success — subscribing to state_changed events')
    // Note: subscribe_events MUST include an id field — HA requires it for response correlation
    send({ id: nextId(), type: 'subscribe_events', event_type: 'state_changed' })
    return
  }

  if (msg.type === 'auth_invalid') {
    console.error('[HA WS] Auth failed — invalid token')
    reconnectAttempts++
    return
  }

  if (msg.type === 'event' && typeof msg === 'object') {
    const eventMsg = msg as { event?: unknown }
    if (eventMsg.event && typeof eventMsg.event === 'object') {
      const eventData = eventMsg.event as { event_type?: string; data?: unknown }
      if (eventData.event_type === 'state_changed' && eventData.data && typeof eventData.data === 'object') {
        const data = eventData.data as { entity_id?: string; new_state?: { state?: string } }
        if (data.entity_id && data.new_state?.state !== undefined) {
          handleStateChanged(data)
        }
      }
    }
  }
}

function handleStateChanged(data: { entity_id: string; new_state: { state: string } }): void {
  const cfg = getConfig()
  const relevantRules = cfg.alerts.filter(r => r.entityId === data.entity_id)
  if (relevantRules.length === 0) return

  const entityMap = new Map([[data.entity_id, { entity_id: data.entity_id, state: data.new_state.state, attributes: {} }]])
  const triggered = evaluateAlerts(relevantRules, entityMap)
  if (triggered.length === 0) return

  const results = createTasksForAlerts(triggered)
  const created = results.filter(r => r.action === 'created').map(r => r.alert.taskTitle)
  const skipped = results.filter(r => r.action === 'skipped').map(r => r.alert.taskTitle)

  if (created.length > 0 || skipped.length > 0) {
    console.log(`[HA WS] Created: ${created.join(', ')} | Skipped: ${skipped.join(', ')}`)
    const summary: BroadcastSummary = { source: 'home_assistant', created, skipped }
    broadcast('home_assistant', summary)
  }
}

export function createHAWebSocket(): HAWSClient {
  function connect(): void {
    if (ws) return

    let wsUrl: string
    try {
      const env = loadHAEnv()
      wsUrl = `${env.HOME_ASSISTANT_URL.replace('http', 'ws')}/api/websocket`
    } catch (err) {
      console.warn(`[HA WS] Not connecting — HA not configured: ${(err as Error).message}`)
      return
    }

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[HA WS] Connected, waiting for auth_required...')
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
      if (!_intentionalDisconnect) {
        scheduleReconnect()
      }
      _intentionalDisconnect = false
    }
  }

  function disconnect(): void {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempts = 0
    _intentionalDisconnect = true
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

  return { connect, disconnect }
}
