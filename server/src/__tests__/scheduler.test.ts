import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

vi.mock('../home-assistant/config.js', () => ({
  loadHAEnv: () => ({ HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }),
  loadHAConfig: vi.fn(),
}))

vi.mock('../home-assistant/haWebSocket.js', () => ({
  createHAWebSocket: vi.fn(),
}))

vi.mock('../routes/events.js', () => ({
  broadcast: vi.fn(),
}))

import { startScheduler, stopScheduler, getActiveTimers } from '../home-assistant/scheduler.js'
import { loadHAConfig } from '../home-assistant/config.js'
import { createHAWebSocket } from '../home-assistant/haWebSocket.js'

describe('HA Scheduler — WebSocket mode', () => {
  let mockWsClient: { connect: () => void; disconnect: () => void }

  beforeEach(() => {
    writeBoard(createTestBoard())
    vi.clearAllMocks()
    stopScheduler()
    mockWsClient = { connect: vi.fn(), disconnect: vi.fn() }
    vi.mocked(createHAWebSocket).mockReturnValue(mockWsClient)
  })

  afterEach(() => {
    stopScheduler()
  })

  it('starts a single WebSocket client and connects', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [{ entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const }],
    }
    vi.mocked(loadHAConfig).mockReturnValue(mockConfig)

    startScheduler()

    expect(getActiveTimers()).toBe(1)
    expect(mockWsClient.connect).toHaveBeenCalledOnce()
  })

  it('stopScheduler disconnects the WebSocket client', () => {
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [{ entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const }],
    }
    vi.mocked(loadHAConfig).mockReturnValue(mockConfig)

    startScheduler()
    stopScheduler()

    expect(mockWsClient.disconnect).toHaveBeenCalledOnce()
    expect(getActiveTimers()).toBe(0)
  })

  it('does not start when HA config throws (not configured)', () => {
    vi.mocked(loadHAConfig).mockImplementation(() => { throw new Error('HA .env not found') })

    startScheduler()

    expect(getActiveTimers()).toBe(0)
  })
})
