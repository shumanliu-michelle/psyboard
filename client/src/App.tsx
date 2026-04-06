import { useEffect, useState, useRef } from 'react'
import type { Board } from './types'
import { BoardView } from './components/BoardView'
import { api, setTabId } from './api'

// Generate a unique tab ID for this browser tab
const TAB_ID = Math.random().toString(36).slice(2, 10)

export default function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const tabIdRef = useRef(TAB_ID)

  async function loadBoard() {
    try {
      const data = await api.getBoard()
      setBoard(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load board')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTabId(TAB_ID)
    loadBoard()
  }, [])

  useEffect(() => {
    const es = new EventSource(`/api/events?tabId=${tabIdRef.current}`)
    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      // Ignore events that originated from this tab
      if (data.tabId && data.tabId !== tabIdRef.current) {
        loadBoard()
      }
    }
    es.onerror = () => {
      // EventSource auto-reconnects by default
      console.error('SSE connection error')
    }
    return () => {
      es.close()
    }
  }, [])

  if (loading) {
    return <div style={{ padding: 24, color: '#666' }}>Loading...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#c00' }}>
        <strong>Error:</strong> {error}
        <br />
        <button onClick={loadBoard} style={{ marginTop: 8 }}>
          Retry
        </button>
      </div>
    )
  }

  if (!board) return null

  return <BoardView board={board} onRefresh={loadBoard} />
}
