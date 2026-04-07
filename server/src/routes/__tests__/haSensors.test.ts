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

  it('returns 200 with sensor data mapped from HA entities', async () => {
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
    expect(res.body.litterRobot).toEqual({
      wasteDrawerPercent: 75,
      hopperStatus: 'normal',
      petWeight: 12.5,
      visitsToday: 3,
    })
    expect(res.body.vacuums.s8MaxvUltra).toEqual({
      waterShortage: false,
      dirtyWaterFull: true,
      status: 'running',
    })
    expect(res.body.vacuums.s7Maxv).toEqual({
      waterShortage: false,
      dirtyWaterFull: false,
      status: 'docked',
    })
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

  it('handles partial data when only some sensors are present in HA', async () => {
    // Only litter robot sensors present, no vacuums
    const mockEntities = [
      { entity_id: 'sensor.litter_robot_waste_drawer_percent', state: '80', attributes: {} },
      { entity_id: 'sensor.litter_robot_hopper_status', state: 'low', attributes: {} },
      // pet weight and visits today missing
    ]

    vi.mocked(loadHAEnv).mockReturnValue({
      HOME_ASSISTANT_URL: 'http://10.0.0.229:8123',
      HOME_ASSISTANT_TOKEN: 'test-token',
    })
    vi.mocked(getAllStates).mockResolvedValue(mockEntities as any)

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(200)
    expect(res.body.litterRobot).toEqual({
      wasteDrawerPercent: 80,
      hopperStatus: 'low',
      petWeight: 0,
      visitsToday: 0,
    })
    // Vacuum entities are absent - mapVacuum receives fallback with state 'unavailable'
    expect(res.body.vacuums.s8MaxvUltra.status).toBe('unavailable')
    expect(res.body.vacuums.s7Maxv.status).toBe('unavailable')
    expect(res.body.timestamp).toBeTruthy()
  })

  it('handles unexpected non-numeric state values gracefully without crashing', async () => {
    const mockEntities = [
      { entity_id: 'sensor.litter_robot_waste_drawer_percent', state: 'not_a_number', attributes: {} },
      { entity_id: 'sensor.litter_robot_hopper_status', state: 'normal', attributes: {} },
      { entity_id: 'sensor.litter_robot_pet_weight', state: 'unknown', attributes: {} },
      { entity_id: 'sensor.litter_robot_visits_today', state: 'NaN', attributes: {} },
      { entity_id: 'vacuum.s8_maxv_ultra', state: 'running', attributes: { water_shortage: false, dirty_water_full: false } },
      { entity_id: 'vacuum.s7_maxv', state: 'docked', attributes: { water_shortage: false } },
    ]

    vi.mocked(loadHAEnv).mockReturnValue({
      HOME_ASSISTANT_URL: 'http://10.0.0.229:8123',
      HOME_ASSISTANT_TOKEN: 'test-token',
    })
    vi.mocked(getAllStates).mockResolvedValue(mockEntities as any)

    const res = await request(app).get('/api/ha/sensors')

    expect(res.status).toBe(200)
    // parseFloat/parseInt with || 0 fallback converts NaN to 0
    expect(res.body.litterRobot.wasteDrawerPercent).toBe(0)
    expect(res.body.litterRobot.petWeight).toBe(0)
    expect(res.body.litterRobot.visitsToday).toBe(0)
    expect(res.body.vacuums.s8MaxvUltra.status).toBe('running')
    expect(res.body.timestamp).toBeTruthy()
  })
})
