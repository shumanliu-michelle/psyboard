import express from 'express'
import { Router } from 'express'
import type { Task } from '../../types.js'

const router = Router()

// Map of connected SSE clients: Express Response → { tabId }
const clients = new Map<express.Response, { tabId: string }>()
let clientIdCounter = 0

export type BroadcastSummary =
  | { source: 'home_assistant'; created: string[]; skipped: string[] }
  | { source: 'tab'; created: Task[]; updated: Task[]; deleted: string[] }
  | null

export function broadcast(sourceTabId?: string, summary?: BroadcastSummary): void {
  const payload = JSON.stringify({ type: 'board_updated', tabId: sourceTabId ?? null, summary })
  const message = `data: ${payload}\n\n`
  console.log(`[SSE] Broadcasting to ${clients.size} client(s)${sourceTabId ? ` (source: ${sourceTabId})` : ''}`)

  // Collect disconnected clients first to avoid mutating Map during iteration
  const deadClients: express.Response[] = []

  for (const [client] of clients) {
    try {
      client.write(message)
    } catch {
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

  // Accept tabId from query param so client can filter out its own events
  const tabId = (req.query.tabId as string) || `unknown-${++clientIdCounter}`

  // Send initial comment to establish connection
  res.write(`: connected (tabId: ${tabId})\n\n`)
  console.log(`[SSE] Client ${tabId} connected (${clients.size + 1} total)`)

  // Register client with its tabId
  clients.set(res, { tabId })

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    const deadClients: express.Response[] = []
    for (const [client] of clients) {
      try {
        client.write(': heartbeat\n\n')
      } catch {
        deadClients.push(client)
      }
    }
    for (const dead of deadClients) {
      clients.delete(dead)
    }
  }, 30000)

  // Clean up on close
  req.on('close', () => {
    const entry = clients.get(res)
    clearInterval(heartbeat)
    clients.delete(res)
    console.log(`[SSE] Client ${entry?.tabId ?? 'unknown'} disconnected (${clients.size} total)`)
  })
})

export default router