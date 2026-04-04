import { useState } from 'react'
import { api } from '../api'

interface AddTaskFormProps {
  columnId: string
  onAdded: () => void
  onCancel: () => void
}

export function AddTaskForm({ columnId, onAdded, onCancel }: AddTaskFormProps) {
  const [title, setTitle] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    try {
      await api.createTask({ title: title.trim(), columnId })
      setTitle('')
      onAdded()
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }

  return (
    <form className="add-form" onSubmit={handleSubmit}>
      <input
        autoFocus
        placeholder="Task title"
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
