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
    stopScheduler()
  })

  afterEach(() => {
    stopScheduler()
  })

  it('starts a single global timer for all alerts and fires immediately', async () => {
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

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    startScheduler()

    // Should have exactly 1 global timer
    expect(getActiveTimers()).toBe(1)

    // Timer should be set with correct interval
    expect(setIntervalSpy).toHaveBeenCalledOnce()
    expect(setIntervalSpy.mock.calls[0][1]).toBe(10 * 60 * 1000)

    // Give immediate async call a tick to resolve
    await new Promise(r => setTimeout(r, 0))

    // Only sensor.foo was triggered → one task created → one broadcast
    expect(broadcast).toHaveBeenCalledOnce()
    const call = (broadcast as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[1].created).toContain('Foo alert')

    setIntervalSpy.mockRestore()
  })

  it('uses DEFAULT_POLL_INTERVAL_MINUTES when pollIntervalMinutes is not set', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.test', condition: { type: 'isOn' }, taskTitle: 'Test', priority: 'high' as const },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(getAllStates as ReturnType<typeof vi.fn>).mockResolvedValue([])

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')

    startScheduler()

    expect(setIntervalSpy.mock.calls[0][1]).toBe(5 * 60 * 1000)

    setIntervalSpy.mockRestore()
  })

  it('does not start timer when HA config throws (not configured)', () => {
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('HA .env file not found')
    })

    startScheduler()

    expect(getActiveTimers()).toBe(0)
  })

  it('stopScheduler clears the global timer', () => {
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
