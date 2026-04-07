import { Router } from 'express'
import { loadHAEnv } from '../home-assistant/config.js'
import { getAllStates, type HAEntity } from '../home-assistant/haClient.js'

const router = Router()

type LitterRobot = {
  wasteDrawerPercent: number
  hopperStatus: string
  petWeight: number
  visitsToday: number
}

type Vacuum = {
  waterShortage: boolean
  dirtyWaterFull?: boolean
  status: string
}

type HASensorsResponse = {
  litterRobot: LitterRobot
  vacuums: {
    s8MaxvUltra: Vacuum
    s7Maxv: Vacuum
  }
  timestamp: string
}

function mapVacuum(entity: HAEntity): Vacuum {
  return {
    waterShortage: (entity.attributes['water_shortage'] as boolean) ?? false,
    dirtyWaterFull: (entity.attributes['dirty_water_full'] as boolean) ?? false,
    status: entity.state,
  }
}

router.get('/sensors', async (_req, res) => {
  let env: ReturnType<typeof loadHAEnv>

  try {
    env = loadHAEnv()
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    return
  }

  let entities: HAEntity[]
  try {
    entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })
    console.log(`[HA] Fetched ${entities.length} entities from Home Assistant`)
  } catch (err) {
    console.log(`[HA] Fetch failed: ${(err as Error).message}`)
    res.status(500).json({ error: (err as Error).message })
    return
  }

  const entityMap = new Map<string, HAEntity>()
  for (const entity of entities) {
    entityMap.set(entity.entity_id, entity)
  }

  const litterRobot: LitterRobot = {
    wasteDrawerPercent: parseFloat(entityMap.get('sensor.litter_robot_waste_drawer_percent')?.state ?? '0') || 0,
    hopperStatus: entityMap.get('sensor.litter_robot_hopper_status')?.state ?? 'unknown',
    petWeight: parseFloat(entityMap.get('sensor.litter_robot_pet_weight')?.state ?? '0') || 0,
    visitsToday: parseInt(entityMap.get('sensor.litter_robot_visits_today')?.state ?? '0', 10) || 0,
  }

  const vacuums: HASensorsResponse['vacuums'] = {
    s8MaxvUltra: mapVacuum(entityMap.get('vacuum.s8_maxv_ultra') ?? { entity_id: '', state: 'unavailable', attributes: {} }),
    s7Maxv: mapVacuum(entityMap.get('vacuum.s7_maxv') ?? { entity_id: '', state: 'unavailable', attributes: {} }),
  }

  res.json({
    litterRobot,
    vacuums,
    timestamp: new Date().toISOString(),
  })
})

export default router
