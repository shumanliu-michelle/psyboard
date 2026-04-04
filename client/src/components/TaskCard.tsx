import { useState, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'
import { api } from '../api'

interface TaskCardProps {
  task: Task
  onUpdated: () => void
  onDeleted: () => void
}

const PencilIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
)

const CrossIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
)

const PersonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

export function TaskCard({ task, onUpdated, onDeleted }: TaskCardProps) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [showAssign, setShowAssign] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close popover on click outside
  useEffect(() => {
    if (!showAssign) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowAssign(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAssign])

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
      style={{ ...style, position: 'relative' }}
      className={`task-card${isDragging ? ' dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        zIndex: 5,
      }}>
        {/* Person/assign icon */}
        <button
          onClick={e => { e.stopPropagation(); setShowAssign(!showAssign) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px', display: 'flex' }}
          aria-label="Assign"
        >
          <PersonIcon />
        </button>
        {/* Pencil icon */}
        <button
          onClick={e => { e.stopPropagation(); setEditing(true) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px', display: 'flex' }}
          aria-label="Edit"
        >
          <PencilIcon />
        </button>
        {/* Cross icon */}
        <button
          onClick={e => { e.stopPropagation(); handleDelete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px', display: 'flex' }}
          aria-label="Delete"
        >
          <CrossIcon />
        </button>
      </div>
      <div className="task-card-title" onDoubleClick={() => setEditing(true)}>
        {task.title}
      </div>
      {task.assignee && (
        <div style={{ marginTop: 4 }}>
          <span style={{
            background: task.assignee === 'SL' ? '#d1fae5' : '#dbeafe',
            color: task.assignee === 'SL' ? '#065f46' : '#1e40af',
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 11,
            fontWeight: 500,
          }}>
            {task.assignee}
          </span>
        </div>
      )}
      {showAssign && (
        <div ref={popoverRef} style={{
          position: 'absolute',
          top: 28,
          right: 8,
          background: 'white',
          border: '1px solid #e5e7eb',
          borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          padding: 8,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          minWidth: 100,
        }}>
          {(['SL', 'KL'] as const).map(opt => (
            <button
              key={opt}
              onClick={async e => {
                e.stopPropagation()
                try {
                  await api.updateTask(task.id, { assignee: opt })
                  onUpdated()
                  setShowAssign(false)
                } catch (err) {
                  console.error('Failed to assign:', err)
                }
              }}
              style={{
                background: task.assignee === opt ? (opt === 'SL' ? '#d1fae5' : '#dbeafe') : 'none',
                border: 'none',
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
              }}
            >
              {opt}
            </button>
          ))}
          <button
            onClick={async e => {
              e.stopPropagation()
              try {
                await api.updateTask(task.id, { assignee: null })
                onUpdated()
                setShowAssign(false)
              } catch (err) {
                console.error('Failed to unassign:', err)
              }
            }}
            style={{
              background: !task.assignee ? '#f3f4f6' : 'none',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: 13,
              color: '#6b7280',
            }}
          >
            Unassigned
          </button>
        </div>
      )}
    </div>
  )
}
