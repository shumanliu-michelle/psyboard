import { getAllStates } from './haClient.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { loadHAEnv, loadHAConfig } from './config.js'
import { broadcast, type BroadcastSummary } from '../routes/events.js'

const DEFAULT_POLL_INTERVAL_MINUTES = 5

// Single global timer id
let globalTimerId: ReturnType<typeof setInterval> | null = null

async function checkAllAlerts(): Promise<void> {
  try {
    const env = loadHAEnv()
    const config = loadHAConfig()

    const entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })

    const entityMap = new Map<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>()
    for (const entity of entities) {
      entityMap.set(entity.entity_id, entity)
    }

    const triggered = evaluateAlerts(config.alerts, entityMap)
    const results = createTasksForAlerts(triggered)

    const created = results.filter(r => r.action === 'created').map(r => r.alert.taskTitle)
    const skipped = results.filter(r => r.action === 'skipped').map(r => r.alert.taskTitle)

    if (created.length > 0) {
      console.log(`[HA Scheduler] Created: ${created.join(', ')}`)
    }
    if (skipped.length > 0) {
      console.log(`[HA Scheduler] Skipped: ${skipped.join(', ')}`)
    }

    if (created.length > 0 || skipped.length > 0) {
      const summary: BroadcastSummary = { source: 'home_assistant', created, skipped }
      broadcast(undefined, summary)
    }
  } catch (err) {
    console.error(`[HA Scheduler] Error during poll:`, (err as Error).message)
  }
}

export function startScheduler(): void {
  let config: ReturnType<typeof loadHAConfig>
  try {
    config = loadHAConfig()
  } catch (err) {
    console.warn(`[HA Scheduler] Not starting — HA not configured: ${(err as Error).message}`)
    return
  }

  const intervalMinutes = config.pollIntervalMinutes ?? DEFAULT_POLL_INTERVAL_MINUTES
  const intervalMs = intervalMinutes * 60 * 1000

  console.log(`[HA Scheduler] Scheduling all ${config.alerts.length} alerts every ${intervalMinutes} min`)

  // Fire immediately on start
  checkAllAlerts()

  globalTimerId = setInterval(() => {
    checkAllAlerts()
  }, intervalMs)
}

export function stopScheduler(): void {
  if (globalTimerId !== null) {
    clearInterval(globalTimerId)
    globalTimerId = null
  }
  console.log('[HA Scheduler] Stopped')
}

export function getActiveTimers(): number {
  return globalTimerId !== null ? 1 : 0
}
