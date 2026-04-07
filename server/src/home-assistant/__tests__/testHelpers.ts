/**
 * MockWebSocket — fake WebSocket for unit-testing haWebSocket.ts
 *
 * Usage:
 *   vi.stubGlobal('WebSocket', MockWebSocket)
 *   // In test: MockWebSocket.emitOpen()
 *   //          MockWebSocket.emitMessage({ id: 1, type: 'auth', success: true })
 *   // Assert:  MockWebSocket.sentMessages contains JSON-serialized strings
 */
export class MockWebSocket {
  static instances: MockWebSocket[] = []
  static sentMessages: object[] = []

  // Static constants to match real WebSocket API
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  url: string = ''
  readyState: number = 0 // CONNECTING

  // Event handler refs (set by the code under test)
  onopen: ((event: unknown) => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    // Auto-set to OPEN after constructor (like real WS after async connect)
    // Tests can emit open manually via emitOpen()
  }

  send(data: string): void {
    if (this.readyState === 1) { // OPEN
      try {
        MockWebSocket.sentMessages.push(JSON.parse(data))
      } catch {
        MockWebSocket.sentMessages.push({ raw: data })
      }
    }
  }

  close(): void {
    this.readyState = 3 // CLOSED
    if (this.onclose) this.onclose({})
  }

  // --- Static helpers tests use to simulate WS events ---

  static emitOpen(): void {
    for (const ws of MockWebSocket.instances) {
      ws.readyState = 1 // OPEN
      if (ws.onopen) ws.onopen({})
    }
  }

  static emitMessage(msg: object): void {
    for (const ws of MockWebSocket.instances) {
      if (ws.readyState !== 1) continue
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify(msg) })
      }
    }
  }

  static emitError(err: unknown): void {
    for (const ws of MockWebSocket.instances) {
      if (ws.onerror) ws.onerror(err)
    }
  }

  static emitClose(): void {
    for (const ws of MockWebSocket.instances) {
      ws.readyState = 3 // CLOSED
      if (ws.onclose) ws.onclose({})
    }
  }

  static reset(): void {
    MockWebSocket.instances = []
    MockWebSocket.sentMessages = []
  }
}

/**
 * Make a fake inbound WS message with the given fields.
 * Used by tests to construct inbound messages from HA server.
 */
export function makeFakeMessage(overrides: object): object {
  return { id: -1, type: '', ...overrides }
}
