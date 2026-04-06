import { useState } from 'react'
import { api } from '../api'

interface AddColumnFormProps {
  onAdded: () => void
  onCancel: () => void
}

export function AddColumnForm({ onAdded, onCancel }: AddColumnFormProps) {
  const [title, setTitle] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.createColumn({ title: title.trim(), accent: '#6366f1' })
      setTitle('')
      onAdded()
    } catch (err) {
      console.error('Failed to create column:', err)
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit} style={{ marginTop: 8 }}>
      <input
        autoFocus
        placeholder="Column title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Escape' && onCancel()}
      />
      <div className="add-form-actions">
        <button type="submit" className="btn-primary">Add</button>
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
