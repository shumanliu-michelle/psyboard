import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { writeBoard } from '../../store/boardStore.js'
import { loadHAEnv } from '../../home-assistant/config.js'
import { getAllStates } from '../../home-assistant/haClient.js'

vi.mock('../../home-assistant/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../home-assistant/config.js')>()
  return {
    ...actual,
    loadHAEnv: vi.fn(),
  }
})

vi.mock('../../home-assistant/haClient.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../home-assistant/haClient.js')>()
  return {
    ...actual,
    getAllStates: vi.fn(),
  }
})

describe('GET /api/ha/sensors', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = setupTestBoard()
    const board = createTestBoard([])
    writeBoard(board)
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestBoard()
  })

  it('returns 200 with raw HA entities array', async () => {
    const mockEntities = [
      { entity_id: 'sensor.litter_robot_waste_drawer_percent', state: '75', attributes: {} },
      { entity_id: 'sensor.litter_robot_hopper_status', state: 'normal', attributes: {} },
      { entity_id: 'sensor.litter_robot_pet_weight', state: '12.5', attributes: {} },
      { entity_id: 'sensor.litter_robot_visits_today', state: '3', attributes: {} },
      { entity_id: 'vacuum.s8_maxv_ultra', state: 'running', attributes: { water_shortage: false, dirty_water_full: true } },
      { entity_id: 'vacuum.s7_maxv', state: 'docked', attributes: { water_shortage: false } },
    ]

    vi.mocked(loadHAEnv).mockReturnValue({
      HOME_ASSISTANT_URL: 'http://10.0.0.229:8123',
      HOME_ASSISTANT_TOKEN: 'test-token',
    })
    vi.mocked(getAllStates).mockResolvedValue(mockEntities as any)

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(200)
    expect(res.body.entities).toEqual(mockEntities)
    expect(res.body.entityCount).toBe(6)
    expect(res.body.timestamp).toBeTruthy()
  })

  it('returns 500 when loadHAEnv throws', async () => {
    vi.mocked(loadHAEnv).mockImplementation(() => {
      throw new Error('HA .env file not found')
    })

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('HA .env file not found')
  })

  it('returns 500 when getAllStates throws', async () => {
    vi.mocked(loadHAEnv).mockReturnValue({
      HOME_ASSISTANT_URL: 'http://10.0.0.229:8123',
      HOME_ASSISTANT_TOKEN: 'test-token',
    })
    vi.mocked(getAllStates).mockRejectedValue(new Error('HA request failed'))

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(500)
    expect(res.body.error).toContain('HA request failed')
  })

  it('returns empty entities array when HA has no entities', async () => {
    vi.mocked(loadHAEnv).mockReturnValue({
      HOME_ASSISTANT_URL: 'http://10.0.0.229:8123',
      HOME_ASSISTANT_TOKEN: 'test-token',
    })
    vi.mocked(getAllStates).mockResolvedValue([] as any)

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(200)
    expect(res.body.entities).toEqual([])
    expect(res.body.entityCount).toBe(0)
    expect(res.body.timestamp).toBeTruthy()
  })
})
