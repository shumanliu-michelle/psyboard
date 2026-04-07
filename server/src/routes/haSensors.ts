import { Router } from 'express'
import { loadHAEnv } from '../home-assistant/config.js'
import { getAllStates } from '../home-assistant/haClient.js'

const router = Router()

router.get('/sensors', async (_req, res) => {
  let env: ReturnType<typeof loadHAEnv>

  try {
    env = loadHAEnv()
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    return
  }

  let entities: Awaited<ReturnType<typeof getAllStates>>
  try {
    entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })
    console.log(`[HA] Fetched ${entities.length} entities from Home Assistant`)
  } catch (err) {
    console.log(`[HA] Fetch failed: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
    return
  }

  res.json({
    entities,
    timestamp: new Date().toISOString(),
    entityCount: entities.length,
  })
})

export default router
