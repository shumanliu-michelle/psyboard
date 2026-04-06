import { useEffect, useState } from 'react'
import type { Board } from './types'
import { BoardView } from './components/BoardView'
import { api } from './api'

export default function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
    loadBoard()
  }, [])

  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = () => {
      loadBoard()
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
