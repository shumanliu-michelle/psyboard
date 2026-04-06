import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

vi.mock('../home-assistant/config.js', () => ({
  loadHAEnv: () => ({ HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }),
  loadHAConfig: vi.fn(),
}))

vi.mock('../home-assistant/haClient.js', () => ({
  getAllStates: vi.fn(),
}))

vi.mock('../routes/events.js', () => ({
  broadcast: vi.fn(),
}))

import { startScheduler, stopScheduler, getActiveTimers } from '../home-assistant/scheduler.js'
import { loadHAConfig } from '../home-assistant/config.js'
import { getAllStates } from '../home-assistant/haClient.js'
import { broadcast } from '../routes/events.js'

describe('HA Scheduler', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
    vi.clearAllMocks()
    stopScheduler() // ensure clean state
  })

  afterEach(() => {
    stopScheduler()
  })

  it('starts one timer per alert and fires immediately', async () => {
    const mockConfig = {
      defaultColumn: 'Today',
      pollIntervalMinutes: 10,
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo alert', priority: 'high' as const },
        { entityId: 'sensor.bar', condition: { type: 'isOn' }, taskTitle: 'Bar alert', priority: 'medium' as const },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(getAllStates as ReturnType<typeof vi.fn>).mockResolvedValue([
      { entity_id: 'sensor.foo', state: 'on', attributes: {} },
      { entity_id: 'sensor.bar', state: 'off', attributes: {} },
    ])

    // startScheduler fires immediately, so broadcast should be called for sensor.foo (triggered)
    startScheduler()

    // Give the immediate async call a tick to resolve
    await new Promise(r => setTimeout(r, 0))

    expect(getActiveTimers()).toBe(2)
    // Only sensor.foo was triggered (state: 'on') → one task created
    expect(broadcast).toHaveBeenCalledOnce()
    const call = (broadcast as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].created).toContain('Foo alert')
  })

  it('uses per-alert pollIntervalMinutes when specified', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      pollIntervalMinutes: 10,
      alerts: [
        { entityId: 'sensor.quick', condition: { type: 'isOn' }, taskTitle: 'Quick', priority: 'high' as const, pollIntervalMinutes: 1 },
        { entityId: 'sensor.slow', condition: { type: 'isOn' }, taskTitle: 'Slow', priority: 'high' as const, pollIntervalMinutes: 60 },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(getAllStates as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    startScheduler()

    expect(getActiveTimers()).toBe(2)
    // Verify intervals were set with correct durations (setInterval signature: callback, delay, ...args)
    const calls = setIntervalSpy.mock.calls
    expect(calls[0][1]).toBe(1 * 60 * 1000)
    expect(calls[1][1]).toBe(60 * 60 * 1000)

    setIntervalSpy.mockRestore()
  })

  it('does not start timers when HA config throws (not configured)', () => {
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('HA .env file not found')
    })

    startScheduler()

    expect(getActiveTimers()).toBe(0)
  })

  it('stopScheduler clears all timers', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      pollIntervalMinutes: 5,
      alerts: [
        { entityId: 'sensor.test', condition: { type: 'isOn' }, taskTitle: 'Test', priority: 'high' as const },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(getAllStates as ReturnType<typeof vi.fn>).mockResolvedValue([])

    startScheduler()
    expect(getActiveTimers()).toBe(1)

    stopScheduler()
    expect(getActiveTimers()).toBe(0)
  })
})
