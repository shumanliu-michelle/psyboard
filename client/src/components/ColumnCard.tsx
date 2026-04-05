import { useState, useEffect, useRef } from 'react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import type { Column, Task } from '../types'
import { TaskCard, KebabIcon } from './TaskCard'
import { getColumnColor, CUSTOM_COLUMN_COLOR } from '../styles/columnColors'

const GripIcon = () => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" style={{ flexShrink: 0 }}>
    <circle cx="2" cy="2.5" r="1.5" />
    <circle cx="8" cy="2.5" r="1.5" />
    <circle cx="2" cy="8" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="2" cy="13.5" r="1.5" />
    <circle cx="8" cy="13.5" r="1.5" />
  </svg>
)
import { QuickAddForm } from './QuickAddForm'
import { api } from '../api'

interface ColumnCardProps {
  column: Column
  tasks: Task[]
  onRefresh: () => void
  onOpenDrawer: (task?: Task, initialTitle?: string) => void  // opens drawer
}

export function ColumnCard({ column, tasks, onRefresh, onOpenDrawer }: ColumnCardProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(column.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const {
  attributes: columnAttributes,
  listeners: columnListeners,
  setNodeRef: setColumnRef,
  transform: columnTransform,
  transition: columnTransition,
  isDragging: isColumnDragging,
} = useSortable({ id: column.id, data: { type: 'column' } })

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: column.id })

  useEffect(() => {
    if (!showMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMenu])

  const customColors = CUSTOM_COLUMN_COLOR
  const systemColors = getColumnColor(column.systemKey)

  return (
    <div
      ref={setColumnRef}
      className="column"
      style={{
        background: isOver ? '#f9fafb' : undefined,
        transform: CSS.Transform.toString(columnTransform),
        transition: columnTransition,
        opacity: isColumnDragging ? 0.5 : 1,
        boxShadow: isOver
          ? undefined
          : `0 4px 16px ${systemColors.shadow}`,
      }}
    >
      {column.kind === 'custom' ? (
      <div
        {...columnAttributes}
        {...columnListeners}
        className="column-header"
        ref={menuRef}
        style={{
          borderTop: `2px solid ${customColors.accent}`,
          cursor: 'grab',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: customColors.accent,
            flexShrink: 0,
          }} />
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter') {
                  try {
                    await api.updateColumn(column.id, { title: renameValue.trim() })
                    setRenaming(false)
                    onRefresh()
                  } catch { setRenameValue(column.title); setRenaming(false) }
                }
                if (e.key === 'Escape') { setRenameValue(column.title); setRenaming(false) }
              }}
              onBlur={async () => {
                try {
                  await api.updateColumn(column.id, { title: renameValue.trim() })
                  onRefresh()
                } catch { }
                setRenaming(false)
              }}
            />
          ) : (
            <h3 style={{ color: customColors.accent, flex: 1 }}>
              {column.title}
            </h3>
          )}
        </div>
        <span className="task-count" style={{
          background: customColors.bg,
          color: customColors.accent,
        }}>
          {tasks.length}
        </span>
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}
            aria-label="Menu"
          >
            <KebabIcon />
          </button>
          {showMenu && (
            <div style={{
              position: 'absolute',
              top: 20,
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
                onClick={e => { e.stopPropagation(); setShowMenu(false); setRenaming(true) }}
                style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#374151' }}
              >
                Rename
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                style={{ background: 'none', border: 'none', borderRadius: 4, padding: '6px 10px', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: '#dc2626' }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
        {confirmDelete && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 300 }}>
              <p style={{ marginBottom: 16 }}>Delete column "{column.title}"? All tasks will be moved to Backlog.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 12px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={async () => {
                  try {
                    await api.deleteColumn(column.id)
                    setConfirmDelete(false)
                    onRefresh()
                  } catch { setConfirmDelete(false) }
                }} style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    ) : (
      <div
        {...columnAttributes}
        {...columnListeners}
        className="column-header"
        style={{
          borderTop: `2px solid ${systemColors.accent}`,
          cursor: 'grab',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: systemColors.accent,
            flexShrink: 0,
          }} />
          <h3 style={{ color: systemColors.accent, flex: 1 }}>
            {column.title}
          </h3>
        </div>
        <span className="task-count" style={{
          background: systemColors.bg,
          color: systemColors.accent,
        }}>
          {tasks.length}
        </span>
      </div>
    )}

      <div ref={setDroppableRef} className="column-tasks">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdated={onRefresh}
              onDeleted={onRefresh}
              onOpenEdit={() => onOpenDrawer(task)}
            />
          ))}
        </SortableContext>
      </div>

      {column.systemKey !== 'done' && (
        <QuickAddForm
          columnId={column.id}
          onExpandToDrawer={title => onOpenDrawer(undefined, title)}
          onRefresh={onRefresh}
        />
      )}
    </div>
  )
}
