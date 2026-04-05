import { useState, useEffect, useRef } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task } from '../types'
import { DONE_COLUMN_ID } from '../types'
import { api } from '../api'

interface TaskCardProps {
  task: Task
  onUpdated: () => void
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

export function TaskCard({ task, onUpdated, onDeleted, onOpenEdit }: TaskCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [menuMode, setMenuMode] = useState<'main' | 'assign' | 'priority'>('main')
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      const menuEl = popoverRef.current
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setShowMenu(false)
        setMenuMode('main')
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

  const isCompleted = task.columnId === DONE_COLUMN_ID

  async function handleDelete() {
    try {
      await api.deleteTask(task.id)
      onDeleted()
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
  }

  async function handleQuickAssign(assignee: 'SL' | 'KL' | null) {
    try {
      await api.updateTask(task.id, { assignee })
      onUpdated()
      setShowMenu(false)
      setMenuMode('main')
    } catch (err) {
      console.error('Failed to assign:', err)
    }
  }

  async function handleQuickPriority(priority: 'low' | 'medium' | 'high' | null) {
    try {
      await api.updateTask(task.id, { priority: priority ?? undefined })
      onUpdated()
      setShowMenu(false)
      setMenuMode('main')
    } catch (err) {
      console.error('Failed to set priority:', err)
    }
  }

  const priorityColor =
  task.priority === 'high'   ? '#ef4444' :
  task.priority === 'medium' ? '#f59e0b' :
  task.priority === 'low'    ? '#22c55e' :
  undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex',
        flexDirection: 'row',
        borderLeft: task.priority ? `3px solid ${priorityColor}` : '3px solid transparent',
      }}
      className={`task-card${isDragging ? ' dragging' : ''}`}
      onClick={() => onOpenEdit()}
    >
      {/* Left: drag handler — full height */}
      <div style={{
        width: 28,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        touchAction: 'none',
      }}
        {...attributes}
        {...listeners}
      >
        <GripIcon />
      </div>

      {/* Middle: title + description — fills remaining width, centered */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minWidth: 0,
      }}>
        <div className="task-card-title" style={{ paddingLeft: 4 }} onDoubleClick={() => onOpenEdit()}>
          {task.title}
        </div>
        {task.description && (
          <div className="task-description">
            {task.description}
          </div>
        )}
      </div>

      {/* Right: kebab + assignee — full height, right-aligned */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexShrink: 0,
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
            top: 0,
            left: 28,
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            padding: 4,
            zIndex: 10,
            minWidth: 90,
          }}>
            {menuMode === 'main' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {!isCompleted && (
                  <>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuMode('assign') }}
                      style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
                    >
                      Assign
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setMenuMode('priority') }}
                      style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
                    >
                      Priority
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setShowMenu(false); onOpenEdit() }}
                      style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
                    >
                      Edit
                    </button>
                  </>
                )}
                <button
                  onClick={e => { e.stopPropagation(); setShowMenu(false); handleDelete() }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}
                >
                  Delete
                </button>
              </div>
            )}
            {menuMode === 'assign' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickAssign('SL') }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: task.assignee === 'SL' ? '#065f46' : '#374151', fontWeight: task.assignee === 'SL' ? 600 : 400 }}
                >
                  SL
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickAssign('KL') }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: task.assignee === 'KL' ? '#1e40af' : '#374151', fontWeight: task.assignee === 'KL' ? 600 : 400 }}
                >
                  KL
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickAssign(null) }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#6b7280' }}
                >
                  None
                </button>
              </div>
            )}
            {menuMode === 'priority' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickPriority('low') }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: task.priority === 'low' ? '#065f46' : '#374151', fontWeight: task.priority === 'low' ? 600 : 400 }}
                >
                  Low
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickPriority('medium') }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: task.priority === 'medium' ? '#92400e' : '#374151', fontWeight: task.priority === 'medium' ? 600 : 400 }}
                >
                  Med
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickPriority('high') }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: task.priority === 'high' ? '#dc2626' : '#374151', fontWeight: task.priority === 'high' ? 600 : 400 }}
                >
                  High
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleQuickPriority(null) }}
                  style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#6b7280' }}
                >
                  None
                </button>
              </div>
            )}
          </div>
        )}
        {task.assignee && (
          <span style={{
            background: task.assignee === 'SL' ? '#eef2ff' : '#dbeafe',
            color: task.assignee === 'SL' ? '#6366f1' : '#1e40af',
            borderRadius: '50%',
            width: 20,
            height: 20,
            fontSize: 10,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            {task.assignee}
          </span>
        )}
      </div>
    </div>
  )
}
