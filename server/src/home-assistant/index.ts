import { Router } from 'express'
import { loadHAEnv, loadHAConfig } from './config.js'
import { getAllStates } from './haClient.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'
import { broadcast } from '../routes/events.js'

const router = Router()

router.post('/check', async (_req, res) => {
  let env: ReturnType<typeof loadHAEnv>
  let config: ReturnType<typeof loadHAConfig>

  try {
    env = loadHAEnv()
    config = loadHAConfig()
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    return
  }

  let entities: ReturnType<typeof getAllStates> extends Promise<infer T> ? T : never
  try {
    entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })
  } catch (err) {
    res.status(500).json({ error: `Home Assistant request failed: ${(err as Error).message}` })
    return
  }

  // Build entity map
  const entityMap = new Map<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>()
  for (const entity of entities) {
    entityMap.set(entity.entity_id, entity)
  }

  const triggered = evaluateAlerts(config.alerts, entityMap)
  const results = createTasksForAlerts(triggered)

  // Broadcast board update to all connected SSE clients
  broadcast(undefined)

  const created = results.filter(r => r.action === 'created').map(r => r.alert.taskTitle)
  const skipped = results.filter(r => r.action === 'skipped').map(r => r.alert.taskTitle)

  res.json({ created, skipped, alerts: results.map(r => ({ ...r.alert, action: r.action })) })
})

export default router
