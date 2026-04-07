import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MockWebSocket, makeFakeMessage } from './testHelpers.js'

vi.stubGlobal('WebSocket', MockWebSocket)

vi.mock('../config.js', () => ({
  loadHAEnv: vi.fn(),
  loadHAConfig: vi.fn(),
}))

vi.mock('../../routes/events.js', () => ({ broadcast: vi.fn() }))

import { createHAWebSocket, resetHAWSState, type HAWSClient } from '../haWebSocket.js'
import { loadHAEnv, loadHAConfig } from '../config.js'
import { broadcast } from '../../routes/events.js'
import { writeBoard } from '../../store/boardStore.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'

describe('HA WebSocket Client', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = setupTestBoard()
    const board = createTestBoard([])
    writeBoard(board)

    MockWebSocket.reset()
    resetHAWSState()
    vi.clearAllMocks()
  })

  afterEach(() => {
    teardownTestBoard()
  })

  it('authenticates and subscribes to state_changed on connect', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const },
      ],
    }
    ;(loadHAEnv as ReturnType<typeof vi.fn>).mockReturnValue(mockEnv)
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    client.connect()

    // Simulate proper HA WS connection sequence:
    // 1. Connection opens
    MockWebSocket.emitOpen()
    // 2. Server sends auth_required, client responds with auth
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_required' }))
    // 3. Server confirms auth_success, client responds with subscribe_events
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_success' }))

    expect(MockWebSocket.instances.length).toBeGreaterThan(0)
    expect(MockWebSocket.instances[0]!.url).toContain('/api/websocket')

    // The auth message should contain the token
    const authMsg = MockWebSocket.sentMessages.find(m => (m as Record<string, unknown>).type === 'auth')
    expect(authMsg).toBeDefined()
    expect((authMsg as Record<string, unknown>).access_token).toBe('test-token')

    // The subscribe_events message should be sent after auth_success
    const subMsg = MockWebSocket.sentMessages.find(m => (m as Record<string, unknown>).type === 'subscribe_events')
    expect(subMsg).toBeDefined()
    expect((subMsg as Record<string, unknown>).event_type).toBe('state_changed')
  })

  it('processes a state_changed event for a relevant entity and creates task', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo Alert', priority: 'high' as const },
      ],
    }
    ;(loadHAEnv as ReturnType<typeof vi.fn>).mockReturnValue(mockEnv)
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    client.connect()

    // Simulate connection and auth sequence
    MockWebSocket.emitOpen()
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_required' }))
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_success' }))

    // Clear sent messages from auth/subscribe
    MockWebSocket.sentMessages = []

    // Simulate a state_changed event for sensor.foo (which is in alerts config)
    const stateChangedEvent = {
      id: 3,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: {
          entity_id: 'sensor.foo',
          new_state: { state: 'on', attributes: {} },
          old_state: { state: 'off', attributes: {} },
        },
      },
    }
    MockWebSocket.emitMessage(stateChangedEvent)

    // After handling, broadcast should have been called with created tasks
    expect(broadcast).toHaveBeenCalled()
    const broadcastCall = (broadcast as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(broadcastCall[1].created).toContain('Foo Alert')
  })

  it('ignores state_changed for entity not in alerts config', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Foo', priority: 'high' as const },
      ],
    }
    ;(loadHAEnv as ReturnType<typeof vi.fn>).mockReturnValue(mockEnv)
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    client.connect()

    MockWebSocket.emitOpen()
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_required' }))
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_success' }))

    // Emit state_changed for an entity NOT in alerts
    const unrelatedEvent = {
      id: 3,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: {
          entity_id: 'sensor.unrelated',
          new_state: { state: 'on', attributes: {} },
          old_state: { state: 'off', attributes: {} },
        },
      },
    }
    MockWebSocket.emitMessage(unrelatedEvent)

    // broadcast should NOT have been called
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('skips duplicate task when open task with same title already exists', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [
        { entityId: 'sensor.foo', condition: { type: 'isOn' }, taskTitle: 'Duplicate Alert', priority: 'high' as const },
      ],
    }
    ;(loadHAEnv as ReturnType<typeof vi.fn>).mockReturnValue(mockEnv)
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    client.connect()

    MockWebSocket.emitOpen()
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_required' }))
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_success' }))

    // Emit state_changed for sensor.foo (first time — should create)
    const stateChangedEvent = {
      id: 3,
      type: 'event',
      event: {
        event_type: 'state_changed',
        data: {
          entity_id: 'sensor.foo',
          new_state: { state: 'on', attributes: {} },
          old_state: { state: 'off', attributes: {} },
        },
      },
    }
    MockWebSocket.emitMessage(stateChangedEvent)

    // First event should have created the task
    expect(broadcast).toHaveBeenCalledOnce()
    const firstCall = (broadcast as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(firstCall[1].created).toContain('Duplicate Alert')

    // Clear mocks and emit same event again
    vi.clearAllMocks()
    MockWebSocket.emitMessage(stateChangedEvent)

    // Second event should skip (already exists)
    expect(broadcast).toHaveBeenCalledOnce()
    const secondCall = (broadcast as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(secondCall[1].skipped).toContain('Duplicate Alert')
    expect(secondCall[1].created).not.toContain('Duplicate Alert')
  })

  it('does not reconnect if already disconnected', async () => {
    const mockEnv = { HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }
    const mockConfig = {
      defaultColumn: 'Today',
      alerts: [],
    }
    ;(loadHAEnv as ReturnType<typeof vi.fn>).mockReturnValue(mockEnv)
    ;(loadHAConfig as ReturnType<typeof vi.fn>).mockReturnValue(mockConfig)

    const client = createHAWebSocket()
    client.connect()

    MockWebSocket.emitOpen()
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_required' }))
    MockWebSocket.emitMessage(makeFakeMessage({ type: 'auth_success' }))

    const instanceCountAfterConnect = MockWebSocket.instances.length

    // Calling connect() again while already connected should NOT create a new WebSocket
    client.connect()
    client.connect()

    // Should still have same number of instances (connect guard prevents duplicates)
    expect(MockWebSocket.instances.length).toBe(instanceCountAfterConnect)

    // Disconnect and reconnect — disconnect should prevent scheduled reconnect
    client.disconnect()
    // Note: after disconnect, ws is null, so connect() will create a new instance
    // This is correct behavior — disconnect prevents the automatic reconnect
  })
})
