import { useState, useEffect, useRef } from 'react'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'
import type { Column, Task } from '../types'
import { TaskCard, KebabIcon } from './TaskCard'
import { getColumnColor } from '../styles/columnColors'

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

  // ---- Done column pagination ----
  const [donePage, setDonePage] = useState(0)  // number of 7-day pages loaded
  const [olderDoneTasks, setOlderDoneTasks] = useState<Task[]>([])
  const [doneHasMore, setDoneHasMore] = useState(false)

  const DONE_PAGE_DAYS = 7

  function getCompletedAtDaysAgo(completedAt: string): number {
    const completed = new Date(completedAt)
    const today = new Date()
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const completedMidnight = new Date(completed.getFullYear(), completed.getMonth(), completed.getDate())
    return Math.round((todayMidnight.getTime() - completedMidnight.getTime()) / (1000 * 60 * 60 * 24))
  }

  const isDoneColumn = column.systemKey === 'done'

  // All done tasks sorted by completedAt desc (most recent first)
  const allDoneTasks = isDoneColumn
    ? tasks
        .filter(t => t.completedAt != null)
        .sort((a, b) => (b.completedAt! > a.completedAt! ? 1 : -1))
    : []

  // Tasks visible on current page (0 = last 7 days, 1 = last 14 days, etc.)
  const visibleDoneTasks = isDoneColumn
    ? allDoneTasks.filter(t => getCompletedAtDaysAgo(t.completedAt!) < (donePage + 1) * DONE_PAGE_DAYS)
    : []

  const renderedTasks = isDoneColumn
    ? donePage === 0
      ? visibleDoneTasks
      : olderDoneTasks
    : tasks

  async function handleLoadOlderDone() {
    const oldestCompletedAt = allDoneTasks[allDoneTasks.length - 1]?.completedAt
    if (!oldestCompletedAt) return
    try {
      const { tasks: olderTasks, hasMore } = await api.queryTasks({
        columnId: 'col-done',
        columnIdOp: 'eq',
        completedAtOp: 'lt',
        completedAt: oldestCompletedAt,
        limit: 50,
      })
      setDoneHasMore(hasMore)
      // Only advance to page 1 if we actually got older tasks
      // If olderTasks is empty (no more tasks beyond the 7-day window),
      // keep showing page 0 so the Done column doesn't clear
      if (olderTasks.length > 0) {
        setOlderDoneTasks(olderTasks)
        setDonePage(p => p + 1)
      }
    } catch {
      // silently fail
    }
  }

  const systemColors = column.kind === 'system'
    ? getColumnColor(column.systemKey)
    : getColumnColor(undefined, column.accent)

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
          borderBottom: `2px solid ${systemColors.accent}`,
          cursor: 'grab',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="task-count" style={{
            background: systemColors.bg,
            color: systemColors.accent,
          }}>
            {tasks.length}
          </span>
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
            <h3 style={{ color: systemColors.accent, flex: 1 }}>
              {column.title}
            </h3>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: '2px 6px', display: 'flex', flexDirection: 'column', gap: 3 }}
            aria-label="Menu"
          >
            <KebabIcon />
          </button>
          {showMenu && (
            <div className="column-menu-popover" style={{
              position: 'absolute',
              top: 20,
              right: 0,
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
                className="delete-btn"
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
          borderBottom: `2px solid ${systemColors.accent}`,
          cursor: 'grab',
          touchAction: 'none',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="task-count" style={{
            background: systemColors.bg,
            color: systemColors.accent,
          }}>
            {tasks.length}
          </span>
          <h3 style={{ color: systemColors.accent, flex: 1 }}>
            {column.title}
          </h3>
        </div>
      </div>
    )}

      <div ref={setDroppableRef} className="column-tasks">
        <SortableContext items={renderedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {renderedTasks.map(task => (
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

      {/* Done column pagination footer */}
      {isDoneColumn && (donePage === 0
          ? tasks.length > 0  // show if Done has any tasks (server filtered to last 7 days, so older may exist)
          : olderDoneTasks.length > 0 || doneHasMore) && (
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
            {donePage === 0
              ? `Showing last ${DONE_PAGE_DAYS} days`
              : `${olderDoneTasks.length} loaded · ${doneHasMore ? 'more available' : 'no older tasks'}`}
          </div>
          {donePage === 0 || doneHasMore ? (
            <button
              type="button"
              onClick={handleLoadOlderDone}
              style={{
                background: 'none',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                padding: '6px 14px',
                fontSize: 12,
                color: '#475569',
                cursor: 'pointer',
              }}
            >
              {donePage === 0 ? 'Show older tasks' : 'Show even older'}
            </button>
          ) : null}
        </div>
      )}

      {/* Empty state: done column with no tasks */}
      {isDoneColumn && tasks.length === 0 && (
        <div style={{ padding: '24px 12px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
          No completed tasks yet
        </div>
      )}

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
