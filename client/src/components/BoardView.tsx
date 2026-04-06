import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import type { Board, Column, Task } from '../types'
import { TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types'
import { ColumnCard } from './ColumnCard'
import { AddColumnForm } from './AddColumnForm'
import { TaskDrawer } from './TaskDrawer'
import { api } from '../api'

function getToday(): string {
  return new Date().toISOString().split('T')[0]
}

function sortTasksForColumn(tasks: Task[], _columnId: string, _columnKind: 'system' | 'custom', systemKey?: string): Task[] {
  if (systemKey === 'backlog') {
    return [...tasks].sort((a, b) => {
      // 1. doDate ascending (earliest first)
      if (a.doDate && b.doDate) {
        if (a.doDate !== b.doDate) return a.doDate.localeCompare(b.doDate)
      } else if (a.doDate) return -1
      else if (b.doDate) return 1
      // 2. dueDate ascending as fallback
      if (a.dueDate && b.dueDate) {
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      } else if (a.dueDate) return -1
      else if (b.dueDate) return 1
      // 3. Neither date — by createdAt
      return a.createdAt.localeCompare(b.createdAt)
    })
  }
  if (systemKey === 'done') {
    return [...tasks].sort((a, b) => {
      if (!a.completedAt && !b.completedAt) return 0
      if (!a.completedAt) return 1
      if (!b.completedAt) return -1
      return b.completedAt.localeCompare(a.completedAt) // descending (most recent first)
    })
  }
  // Today and custom columns — sort by order
  return [...tasks].sort((a, b) => a.order - b.order)
}

interface BoardViewProps {
  board: Board
  onRefresh: () => void
}

export function BoardView({ board, onRefresh }: BoardViewProps) {
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const [activeColumn, setActiveColumn] = useState<Column | null>(null)
  const [showAddColumn, setShowAddColumn] = useState(false)
  const [blockedDrag, setBlockedDrag] = useState<{ task: Task; targetColumnId: string } | null>(null)
  const [blockedDragDoDate, setBlockedDragDoDate] = useState('')
  const [blockedDragDueDate, setBlockedDragDueDate] = useState('')
  const [blockedDragDateError, setBlockedDragDateError] = useState('')
  const [drawerState, setDrawerState] = useState<{
    open: boolean
    mode: 'create' | 'edit'
    task?: Task
    initialTitle?: string
    columnId?: string
  }>({ open: false, mode: 'create', columnId: undefined })
  const [pendingColumnMove, setPendingColumnMove] = useState<{ task: Task; targetColumnId: string } | null>(null)

  function openDrawerForCreate(columnId: string, initialTitle?: string) {
    setDrawerState({ open: true, mode: 'create', columnId, initialTitle })
  }

  function openDrawerForEdit(task: Task) {
    setDrawerState({ open: true, mode: 'edit', task, columnId: task.columnId })
  }

  function closeDrawer() {
    setDrawerState(s => ({ ...s, open: false }))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  function handleDragStart(event: DragStartEvent) {
    document.body.style.overflow = 'hidden'
    // Check data.type to distinguish column drag from task drag
    const dragType = (event.active.data.current as { type?: string }).type
    if (dragType === 'column') {
      const column = board.columns.find(c => c.id === event.active.id)
      if (column) setActiveColumn(column)
    } else {
      const task = board.tasks.find(t => t.id === event.active.id)
      if (task) setActiveTask(task)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    document.body.style.overflow = 'auto'
    const { active, over } = event
    setActiveTask(null)
    setActiveColumn(null)

    if (!over) return

    const dragType = (active.data.current as { type?: string }).type

    // Handle column reordering
    if (dragType === 'column') {
      if (active.id === over.id) return

      const sortedColumns = board.columns.slice().sort((a, b) => a.position - b.position)
      const oldIndex = sortedColumns.findIndex(c => c.id === active.id)
      const newIndex = sortedColumns.findIndex(c => c.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const columnIds = sortedColumns.map(c => c.id)
      columnIds.splice(oldIndex, 1)
      columnIds.splice(newIndex, 0, active.id as string)
      api.reorderColumns(columnIds).then(onRefresh).catch(console.error)
      return
    }

    // Handle task drag
    const taskId = active.id as string
    const task = board.tasks.find(t => t.id === taskId)
    if (!task) return

    // Determine target column
    const overTask = board.tasks.find(t => t.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : (over.id as string)

    if (!board.columns.find(c => c.id === targetColumnId)) return // target column not fount

    // If dropped on a different column (empty area)
    if (task.columnId !== targetColumnId) {
      // Block moving out of Today if it would be immediately reconcile-promoted back
      const today = getToday()
      const wouldReconcile =
        targetColumnId !== DONE_COLUMN_ID && targetColumnId !== TODAY_COLUMN_ID &&
        (task.doDate && task.doDate <= today || (task.doDate == null && task.dueDate != null && task.dueDate <= today))
      if (wouldReconcile) {
        setBlockedDrag({ task, targetColumnId })
        setBlockedDragDoDate(task.doDate ?? '')
        setBlockedDragDueDate(task.dueDate ?? '')
        setBlockedDragDateError('')
        return
      }
      // Ask for confirmation before cross-column moves
      setPendingColumnMove({ task, targetColumnId })
      return
    }

    // Same-column reordering: dropped on another task
    if (overTask && overTask.columnId === task.columnId) {
      const colTasks = board.tasks
        .filter(t => t.columnId === task.columnId)
        .sort((a, b) => a.order - b.order)

      const oldIndex = colTasks.findIndex(t => t.id === taskId)
      const newIndex = colTasks.findIndex(t => t.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        api.reorderTasks(taskId, task.columnId, newIndex).then(onRefresh).catch(console.error)
      }
      return
    }
  }

  function validateBlockedDates(doDate: string, dueDate: string) {
    if (doDate && dueDate && dueDate < doDate) {
      setBlockedDragDateError('Due date cannot be earlier than do date.')
    } else {
      setBlockedDragDateError('')
    }
  }

  async function confirmBlockedDrag() {
    if (!blockedDrag) return
    const { task, targetColumnId } = blockedDrag

    // Validate doDate <= dueDate
    if (blockedDragDoDate && blockedDragDueDate && blockedDragDueDate < blockedDragDoDate) {
      setBlockedDragDateError('Due date cannot be earlier than do date.')
      return
    }

    await api.updateTask(task.id, {
      doDate: blockedDragDoDate || null,
      dueDate: blockedDragDueDate || null,
      columnId: targetColumnId,
    }).catch(console.error)
    setBlockedDrag(null)
    onRefresh()
  }

  async function confirmPendingMove() {
    if (!pendingColumnMove) return
    const { task, targetColumnId } = pendingColumnMove
    const targetColumn = board.columns.find(c => c.id === targetColumnId)
    if (targetColumn && targetColumn.systemKey !== 'done' && targetColumn.systemKey !== 'backlog') {
      const targetTasks = board.tasks
        .filter(t => t.columnId === targetColumnId)
        .sort((a, b) => a.order - b.order)
      await api.reorderTasks(task.id, targetColumnId, targetTasks.length).catch(console.error)
    } else {
      await api.updateTask(task.id, { columnId: targetColumnId }).catch(console.error)
    }
    setPendingColumnMove(null)
    onRefresh()
  }

  return (
    <>
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
        <SortableContext
          items={board.columns.slice().sort((a, b) => a.position - b.position).map(c => c.id)}
          strategy={horizontalListSortingStrategy}
        >
          {board.columns
            .slice()
            .sort((a, b) => a.position - b.position)
            .map(column => {
              const columnTasks = sortTasksForColumn(
                board.tasks.filter(t => t.columnId === column.id),
                column.id,
                column.kind,
                column.systemKey
              )
              return (
                <ColumnCard
                  key={column.id}
                  column={column}
                  tasks={columnTasks}
                  onRefresh={onRefresh}
                  onOpenDrawer={(task, initialTitle) => {
                    if (task) openDrawerForEdit(task)
                    else openDrawerForCreate(column.id, initialTitle)
                  }}
                />
              )
            })}
        </SortableContext>

        <div className="add-column">
          {showAddColumn ? (
            <AddColumnForm
              onAdded={() => { setShowAddColumn(false); onRefresh() }}
              onCancel={() => setShowAddColumn(false)}
            />
          ) : (
            <button className="add-column-btn" onClick={() => setShowAddColumn(true)}>
              + Add column
            </button>
          )}
        </div>
      </div>

      <DragOverlay>
        {activeColumn ? (
          <div className="column" style={{
            opacity: 0.9,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'none',
            minWidth: 240,
          }}>
            <div className="column-header">
              <h3>{activeColumn.title}</h3>
            </div>
          </div>
        ) : activeTask ? (
          <div className="task-card" data-dnd-drag-overlay style={{ opacity: 0.9, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
            <div className="task-card-title">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>

    {drawerState.open && drawerState.columnId && (
      <TaskDrawer
        mode={drawerState.mode}
        task={drawerState.task}
        initialTitle={drawerState.initialTitle}
        columnId={drawerState.columnId}
        onClose={closeDrawer}
        onSaved={() => { onRefresh() }}
      />
    )}

    {blockedDrag && (
      <div className="drawer-overlay" onClick={() => setBlockedDrag(null)}>
        <div className="task-drawer" onClick={e => e.stopPropagation()}>
          <div className="task-drawer-header">
            <h2>Cannot move task</h2>
            <button className="task-drawer-close" onClick={() => setBlockedDrag(null)} aria-label="Close">×</button>
          </div>
          <div className="task-drawer-body">
            <p style={{ fontSize: 14, color: '#374151', marginBottom: 16 }}>
              <strong>"{blockedDrag.task.title}"</strong> has a doDate of today. To move it, please update the dates below.
            </p>
            <div className="task-drawer-row">
              <div className="task-drawer-field">
                <label htmlFor="blocked-do-date">Do date</label>
                <input
                  id="blocked-do-date"
                  type="date"
                  value={blockedDragDoDate}
                  onChange={e => { setBlockedDragDoDate(e.target.value); validateBlockedDates(e.target.value, blockedDragDueDate) }}
                />
              </div>
              <div className="task-drawer-field">
                <label htmlFor="blocked-due-date">Due date</label>
                <input
                  id="blocked-due-date"
                  type="date"
                  value={blockedDragDueDate}
                  onChange={e => { setBlockedDragDueDate(e.target.value); validateBlockedDates(blockedDragDoDate, e.target.value) }}
                />
              </div>
            </div>
            {blockedDragDateError && <p className="drawer-error">{blockedDragDateError}</p>}
          </div>
          <div className="task-drawer-actions">
            <div className="primary-actions">
              <button className="btn-save" onClick={confirmBlockedDrag} disabled={!!blockedDragDateError}>
                Move task
              </button>
              <button className="btn-cancel" onClick={() => setBlockedDrag(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {pendingColumnMove && (() => {
      const targetColumn = board.columns.find(c => c.id === pendingColumnMove.targetColumnId)
      return (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}
        onClick={() => setPendingColumnMove(null)}>
          <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 320, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}
          onClick={e => e.stopPropagation()}>
            <p style={{ marginBottom: 20 }}>Move "{pendingColumnMove.task.title}" to {targetColumn?.title ?? 'this column'}?</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setPendingColumnMove(null)}
                style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid var(--border-default)', background: 'white' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmPendingMove}
                style={{ padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )
    })()}
    </>
  )
}
