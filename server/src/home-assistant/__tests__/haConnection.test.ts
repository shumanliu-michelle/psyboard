import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../haWebSocket.js', () => ({
  createHAWebSocket: vi.fn(),
}))

vi.mock('../config.js', () => ({
  loadHAConfig: vi.fn(),
}))

import { startHAConnection, stopHAConnection, isHAConnected } from '../haConnection.js'
import { createHAWebSocket } from '../haWebSocket.js'
import { loadHAConfig } from '../config.js'

describe('HA Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stopHAConnection()
  })

  afterEach(() => {
    stopHAConnection()
  })

  it('startHAConnection called twice only creates one WS client', () => {
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

    startHAConnection()
    startHAConnection()

    expect(createHAWebSocket).toHaveBeenCalledOnce()
    expect(isHAConnected()).toBe(true)
  })

  it('stopHAConnection only logs when client was active', () => {
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

    stopHAConnection()
    expect(consoleLogSpy).not.toHaveBeenCalledWith('[HA Connection] Stopped')

    startHAConnection()
    consoleLogSpy.mockClear()
    stopHAConnection()
    expect(consoleLogSpy).toHaveBeenCalledWith('[HA Connection] Stopped')
  })

  it('startHAConnection does not start when HA config throws', () => {
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('HA not configured')
    })

    startHAConnection()

    expect(createHAWebSocket).not.toHaveBeenCalled()
    expect(isHAConnected()).toBe(false)
  })

  it('startHAConnection starts WS client with correct config', () => {
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

    startHAConnection()

    expect(createHAWebSocket).toHaveBeenCalledOnce()
    expect(mockClient.connect).toHaveBeenCalledOnce()
  })
})
