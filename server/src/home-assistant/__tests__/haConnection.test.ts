import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../haWebSocket.js', () => ({
  createHAWebSocket: vi.fn(),
}))

vi.mock('../config.js', () => ({
  loadHAConfig: vi.fn(),
}))

import { startScheduler, stopScheduler, getActiveTimers } from '../haConnection.js'
import { createHAWebSocket } from '../haWebSocket.js'
import { loadHAConfig } from '../config.js'

describe('HA Scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset module state by calling stopScheduler first
    stopScheduler()
  })

  afterEach(() => {
    stopScheduler()
  })

  it('startScheduler called twice only creates one WS client', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(createHAWebSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })

    startScheduler()
    startScheduler()

    // createHAWebSocket should only have been called ONCE
    expect(createHAWebSocket).toHaveBeenCalledOnce()

    // getActiveTimers should return 1
    expect(getActiveTimers()).toBe(1)
  })

  it('stopScheduler only logs when client was active', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    ;(createHAWebSocket as ReturnType<typeof vi.fn>).mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })

    const consoleLogSpy = vi.spyOn(console, 'log')

    // Stop without starting — nothing was running
    stopScheduler()
    // The "Stopped" log should NOT appear when nothing was running
    expect(consoleLogSpy).not.toHaveBeenCalledWith('[HA Scheduler] Stopped')

    // Now start and stop
    startScheduler()
    consoleLogSpy.mockClear()
    stopScheduler()
    // The "Stopped" log SHOULD appear when client was running
    expect(consoleLogSpy).toHaveBeenCalledWith('[HA Scheduler] Stopped')
  })

  it('startScheduler does not start when HA config throws', () => {
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('HA not configured')
    })

    startScheduler()

    expect(createHAWebSocket).not.toHaveBeenCalled()
    expect(getActiveTimers()).toBe(0)
  })

  it('startScheduler starts WS client with correct config', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const },
      ],
    }
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)
    const mockClient = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    }
    ;(createHAWebSocket as ReturnType<typeof vi.fn>).mockReturnValue(mockClient)

    startScheduler()

    expect(createHAWebSocket).toHaveBeenCalledOnce()
    expect(mockClient.connect).toHaveBeenCalledOnce()
  })
})
