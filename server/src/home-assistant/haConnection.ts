import { createHAWebSocket, type HAWSClient } from './haWebSocket.js'
import { loadHAConfig } from './config.js'

let wsClient: HAWSClient | null = null

export function startHAConnection(): void {
  let config: ReturnType<typeof loadHAConfig>
  try {
    config = loadHAConfig()
  } catch (err) {
    console.warn(`[HA Connection] Not starting — HA not configured: ${(err as Error).message}`)
    return
  }

  if (wsClient !== null) {
    console.log('[HA Connection] Already running')
    return
  }

  console.log(`[HA Connection] Starting WebSocket subscription for ${config.alerts.length} alerts`)

  wsClient = createHAWebSocket()
  wsClient.connect()
}

export function stopHAConnection(): void {
  if (wsClient !== null) {
    wsClient.disconnect()
    wsClient = null
    console.log('[HA Connection] Stopped')
  }
}

export function isHAConnected(): boolean {
  return wsClient !== null
}
