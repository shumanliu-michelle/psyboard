import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'
import { api } from '../api'

interface TaskCardProps {
  task: Task
  onUpdated: () => void
  onDeleted: () => void
}

export function TaskCard({ task, onUpdated, onDeleted }: TaskCardProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  async function handleSave() {
    if (!title.trim()) return
    try {
      await api.updateTask(task.id, { title: title.trim() })
      setEditing(false)
      onUpdated()
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  async function handleDelete() {
    try {
      await api.deleteTask(task.id)
      onDeleted()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  if (editing) {
    return (
      <div className="task-card" ref={setNodeRef} style={style}>
        <div className="task-card-title">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') {
                setTitle(task.title)
                setEditing(false)
              }
            }}
            onBlur={handleSave}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card${isDragging ? ' dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="task-card-title" onDoubleClick={() => setEditing(true)}>
        {task.title}
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
        <button
          onClick={e => { e.stopPropagation(); setEditing(true) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#888' }}
        >
          edit
        </button>
        <button
          onClick={e => { e.stopPropagation(); handleDelete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#888' }}
        >
          delete
        </button>
      </div>
    </div>
  )
}
