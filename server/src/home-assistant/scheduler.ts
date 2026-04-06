import { getAllStates } from './haClient.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { loadHAEnv, loadHAConfig } from './config.js'
import { broadcast, type BroadcastSummary } from '../routes/events.js'

const DEFAULT_POLL_INTERVAL_MINUTES = 5

// entityId → interval timer id
const activeTimers = new Map<string, ReturnType<typeof setInterval>>()

function getPollIntervalMinutes(alertPollMinutes: number | undefined, globalPollMinutes: number): number {
  return alertPollMinutes ?? globalPollMinutes
}

async function checkSingleAlert(entityId: string, pollMinutes: number): Promise<void> {
  try {
    const env = loadHAEnv()
    const config = loadHAConfig()

    const entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })

    const entityMap = new Map<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>()
    for (const entity of entities) {
      entityMap.set(entity.entity_id, entity)
    }

    // Only evaluate the alert that triggered this poll
    const alert = config.alerts.find(a => a.entityId === entityId)
    if (!alert) return

    const triggered = evaluateAlerts([alert], entityMap)
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
    console.error(`[HA Scheduler] Error checking ${entityId}:`, (err as Error).message)
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
  const defaultInterval = config.pollIntervalMinutes ?? DEFAULT_POLL_INTERVAL_MINUTES

  for (const alert of config.alerts) {
    const intervalMs = getPollIntervalMinutes(alert.pollIntervalMinutes, defaultInterval) * 60 * 1000
    console.log(`[HA Scheduler] Scheduling ${alert.entityId} every ${intervalMs / 60000} min`)

    // Fire immediately on start
    checkSingleAlert(alert.entityId, alert.pollIntervalMinutes ?? defaultInterval)

    const timerId = setInterval(() => {
      checkSingleAlert(alert.entityId, alert.pollIntervalMinutes ?? defaultInterval)
    }, intervalMs)

    activeTimers.set(alert.entityId, timerId)
  }
}

export function stopScheduler(): void {
  for (const [entityId, timerId] of activeTimers) {
    clearInterval(timerId)
    activeTimers.delete(entityId)
  }
  console.log('[HA Scheduler] Stopped')
}

export function getActiveTimers(): number {
  return activeTimers.size
}
