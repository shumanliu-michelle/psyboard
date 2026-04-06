import { Router } from 'express'

const router = Router()

// Set of connected SSE clients
const clients = new Set<Response>()

export function broadcast(): void {
  const message = 'data: {"type":"board_updated"}\n\n'
  const encoder = new TextEncoder()
  const encoded = encoder.encode(message)

  for (const client of clients) {
    try {
      client.write(encoded)
    } catch {
      // Client disconnected — clean up on next iteration
      clients.delete(client)
    }
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

  // Clean up on close
  req.on('close', () => {
    clients.delete(res)
  })
})

export default router