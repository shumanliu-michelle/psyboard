import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { TODAY_COLUMN_ID, BACKLOG_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

// Shared mock state for per-test configuration (vi.mock is hoisted, so we use hoisted state)
const mockState = vi.hoisted(() => ({
  loadHAEnvError: null as Error | null,
  getAllStatesError: null as Error | null,
}))

vi.mock('../home-assistant/config.js', () => ({
  loadHAEnv: () => {
    if (mockState.loadHAEnvError) throw mockState.loadHAEnvError
    return { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
  },
  loadHAConfig: () => ({
    defaultColumn: 'Today',
    alerts: [
      { entityId: 'binary_sensor.s8_maxv_ultra_water_shortage', condition: { type: 'isOn' }, taskTitle: 'Refill S8 water tank', priority: 'high' },
    ],
  }),
}))

vi.mock('../home-assistant/haClient.js', () => ({
  getAllStates: async () => {
    if (mockState.getAllStatesError) throw mockState.getAllStatesError
    return [
      { entity_id: 'binary_sensor.s8_maxv_ultra_water_shortage', state: 'on', attributes: {} },
      { entity_id: 'binary_sensor.roborock_s7_maxv_water_shortage', state: 'off', attributes: {} },
    ]
  },
}))

describe('POST /api/home-assistant/check', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
    // Reset mock state between tests
    mockState.loadHAEnvError = null
    mockState.getAllStatesError = null
  })

  it('creates a task when alert condition is met', async () => {
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(200)
    expect(res.body.created).toContain('Refill S8 water tank')
    expect(res.body.skipped).toHaveLength(0)
    expect(res.body.alerts).toHaveLength(1)
    expect(res.body.alerts[0].action).toBe('created')
  })

  it('idempotently skips creating a task if it already exists in Today', async () => {
    await request(app).post('/api/home-assistant/check')
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(0)
    expect(res.body.skipped).toContain('Refill S8 water tank')
  })

  it('re-creates a task if the existing one was moved to Done', async () => {
    // First check creates the task
    await request(app).post('/api/home-assistant/check')

    // Move the task to Done
    const board = await request(app).get('/api/board')
    const task = board.body.tasks.find((t: { title: string }) => t.title === 'Refill S8 water tank')
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    // HA fires again — should re-create, not skip
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(200)
    expect(res.body.created).toContain('Refill S8 water tank')
    expect(res.body.skipped).not.toContain('Refill S8 water tank')
  })

  describe('error paths', () => {
    it('returns 500 when HA env is not configured', async () => {
      mockState.loadHAEnvError = new Error('HOME_ASSISTANT_URL not set')
      const res = await request(app).post('/api/home-assistant/check')
      expect(res.status).toBe(500)
    })

    it('returns 500 when HA API request fails', async () => {
      mockState.getAllStatesError = new Error('Network error')
      const res = await request(app).post('/api/home-assistant/check')
      expect(res.status).toBe(500)
    })
  })
})
