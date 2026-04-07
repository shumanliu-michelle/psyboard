import { loadHAEnv, loadHAConfig } from './config.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { broadcast, type BroadcastSummary } from '../routes/events.js'

type WsMessage = { id: number; type: string; [key: string]: unknown }

let ws: InstanceType<typeof WebSocket> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY_MS = 300_000

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
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg))
  }
}

function handleMessage(data: string): void {
  let msg: WsMessage
  try {
    msg = JSON.parse(data) as WsMessage
  } catch {
    return
  }

  // Handle auth flow: server tells us to authenticate, we send auth, server confirms, we subscribe
  if (msg.type === 'auth_required') {
    const env = loadHAEnv()
    send({ id: nextId(), type: 'auth', access_token: env.HOME_ASSISTANT_TOKEN })
    return
  }

  if (msg.type === 'auth_success') {
    // Auth succeeded — subscribe to state_changed events
    send({ id: nextId(), type: 'subscribe_events', event_type: 'state_changed' })
    return
  }

  if (msg.type === 'event' && typeof msg === 'object') {
    const eventData = msg as unknown as { event: { event_type: string; data: { entity_id: string; new_state: { state: string }; old_state: { state: string } } } }
    if (eventData.event?.event_type === 'state_changed') {
      handleStateChanged(eventData.event.data)
    }
  }
}

function handleStateChanged(data: { entity_id: string; new_state: { state: string } }): void {
  const config = loadHAConfig()
  const relevantRules = config.alerts.filter(r => r.entityId === data.entity_id)
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
    broadcast(undefined, summary)
  }
}

export function createHAWebSocket(): HAWSClient {
  function connect(): void {
    if (ws) return

    const env = loadHAEnv()
    const wsUrl = `${env.HOME_ASSISTANT_URL.replace('http', 'ws')}/api/websocket`

    ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('[HA WS] Connected')
      reconnectAttempts = 0
      // Wait for auth_required from server before sending auth
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
