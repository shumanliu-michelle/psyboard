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
