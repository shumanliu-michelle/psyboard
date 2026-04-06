import { useEffect, useState, useRef } from 'react'
import type { Board } from './types'
import { BoardView } from './components/BoardView'
import { HeaderToolbar } from './components/HeaderToolbar'
import { FilterProvider } from './context/FilterContext'
import { api, setTabId } from './api'

const TAB_ID = Math.random().toString(36).slice(2, 10)

export default function App() {
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sseStatus, setSseStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting')
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
    setSseStatus('connecting')

    es.onopen = () => setSseStatus('connected')
    es.onmessage = (event) => {
      const data = JSON.parse(event.data)
      console.log(`[SSE] Received board_updated (source: ${data.tabId ?? 'null'}, mine: ${tabIdRef.current})`)
      if (data.tabId && data.tabId !== tabIdRef.current) {
        console.log(`[SSE] Processing board_updated — triggering refresh`)
        loadBoard()
      } else {
        console.log(`[SSE] Ignoring board_updated — same tab`)
      }
    }
    es.onerror = () => setSseStatus('disconnected')
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

  return (
    <FilterProvider tasks={board.tasks}>
      <BoardView board={board} onRefresh={loadBoard} />
      <HeaderToolbar sseStatus={sseStatus} />
    </FilterProvider>
  )
}