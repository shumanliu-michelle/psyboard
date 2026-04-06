import { Router } from 'express'

const router = Router()

// Set of connected SSE clients
const clients = new Set<Response>()

export function broadcast(): void {
  const message = 'data: {"type":"board_updated"}\n\n'
  const encoder = new TextEncoder()
  const encoded = encoder.encode(message)

  // Collect disconnected clients first to avoid mutating Set during iteration
  const deadClients: Response[] = []

  for (const client of clients) {
    try {
      client.write(encoded)
    } catch {
      // Client disconnected — it may have closed the connection mid-write.
      // We log errors silently since disconnected clients are expected and
      // will be cleaned up below rather than during iteration.
      deadClients.push(client)
    }
  }

  // Remove disconnected clients after iteration completes
  for (const dead of deadClients) {
    clients.delete(dead)
  }
}

router.get('/', (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  // Send initial comment to establish connection
  res.write(': connected\n\n')

  // Register client
  clients.add(res)

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    const deadClients: Response[] = []
    for (const client of clients) {
      try {
        client.write(': heartbeat\n\n')
      } catch {
        // Client disconnected — collect for cleanup
        deadClients.push(client)
      }
    }
    for (const dead of deadClients) {
      clients.delete(dead)
    }
  }, 30000)

  // Clean up on close
  req.on('close', () => {
    clearInterval(heartbeat)
    clients.delete(res)
  })
})

export default router