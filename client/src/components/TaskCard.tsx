import { useState, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'
import { api } from '../api'

interface TaskCardProps {
  task: Task
  onDeleted: () => void
  onOpenEdit: () => void
}

const GripIcon = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{ flexShrink: 0, cursor: 'grab' }}>
    <circle cx="2" cy="2.5" r="1.5" />
    <circle cx="8" cy="2.5" r="1.5" />
    <circle cx="2" cy="8" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="2" cy="13.5" r="1.5" />
    <circle cx="8" cy="13.5" r="1.5" />
  </svg>
)

export const KebabIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="19" r="1" fill="currentColor" />
  </svg>
)

export function TaskCard({ task, onDeleted, onOpenEdit }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      const menuEl = popoverRef.current
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

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

  async function handleDelete() {
    try {
      await api.deleteTask(task.id)
      onDeleted()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, position: 'relative' }}
      className={`task-card${isDragging ? ' dragging' : ''}`}
    >
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        bottom: 0,
        width: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        cursor: 'grab',
        touchAction: 'none',
      }}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </div>
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 5,
      }}>
        <button
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}
          aria-label="Menu"
        >
          <KebabIcon />
        </button>
        {showMenu && (
          <div ref={popoverRef} style={{
            position: 'absolute',
            top: 24,
            right: 0,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: 4,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 90,
          }}>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(false); onOpenEdit() }}
              style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
            >
              Assign
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(false); onOpenEdit() }}
              style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
            >
              Edit
            </button>
            <button
              onClick={e => { e.stopPropagation(); setShowMenu(false); handleDelete() }}
              style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
      <div className="task-card-title" style={{ paddingLeft: 32 }} onDoubleClick={() => onOpenEdit()}>
        {task.title}
      </div>
      {task.assignee && (
        <div style={{ marginTop: 4, paddingLeft: 28 }}>
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
    </div>
  )
}
