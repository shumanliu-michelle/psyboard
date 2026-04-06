import { useState } from 'react'
import { api } from '../api'

interface QuickAddFormProps {
  columnId: string
  onExpandToDrawer: (title: string) => void  // opens drawer with title pre-filled
  onRefresh?: () => void
}

export function QuickAddForm({ columnId, onExpandToDrawer, onRefresh }: QuickAddFormProps) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setError('')
    try {
      await api.createTask({ title: title.trim(), columnId })
      setTitle('') // clear after add
      onRefresh?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '8px 12px' }}>
      <input
        type="text"
        placeholder="Task title"
        value={title}
        onChange={e => { setTitle(e.target.value); setError('') }}
        style={{
          width: '100%',
          border: '1px solid #bbb',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '13px',
          fontFamily: 'inherit',
          marginBottom: '8px',
          boxSizing: 'border-box',
        }}
      />
      {error && (
        <p style={{ color: '#dc2626', fontSize: '12px', margin: '0 0 8px 0' }}>{error}</p>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="submit"
          disabled={!title.trim()}
          style={{
            flex: 1,
            padding: '7px',
            background: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: title.trim() ? 'pointer' : 'not-allowed',
            opacity: title.trim() ? 1 : 0.5,
          }}
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            if (title.trim()) {
              const t = title.trim()
              setTitle('')
              onExpandToDrawer(t)
            }
          }}
          style={{
            padding: '7px 12px',
            background: 'transparent',
            color: '#6366f1',
            border: '1px solid #a5b4fc',
            borderRadius: '4px',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          More fields
        </button>
      </div>
    </form>
  )
}
