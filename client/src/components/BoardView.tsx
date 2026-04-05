import { useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
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
  // Today and custom columns — sort by manualOrder, then order as fallback
  return [...tasks].sort((a, b) => {
    if (a.manualOrder !== undefined && b.manualOrder !== undefined) {
      return a.manualOrder - b.manualOrder
    } else if (a.manualOrder !== undefined) return -1
    else if (b.manualOrder !== undefined) return 1
    return a.order - b.order
  })
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

  const columnSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  function handleDragStart(event: DragStartEvent) {
    document.body.style.overflow = 'hidden'
    const task = board.tasks.find(t => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
    document.body.style.overflow = 'auto'
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const task = board.tasks.find(t => t.id === taskId)
    if (!task) return

    // Determine target column
    const overTask = board.tasks.find(t => t.id === over.id)
    const targetColumnId = overTask ? overTask.columnId : (over.id as string)

    // If dropped on a column (empty area)
    if (board.columns.find(c => c.id === targetColumnId)) {
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
        // Move to new column
        const targetColumn = board.columns.find(c => c.id === targetColumnId)
        const isSortableColumn = targetColumn && targetColumn.systemKey !== 'done' && targetColumn.systemKey !== 'backlog'
        if (isSortableColumn) {
          // Put at top of target column by assigning manualOrder less than current first task
          const targetTasks = board.tasks
            .filter(t => t.columnId === targetColumnId)
            .sort((a, b) => (a.manualOrder ?? a.order) - (b.manualOrder ?? b.order))
          const firstOrder = targetTasks.length > 0 ? (targetTasks[0].manualOrder ?? targetTasks[0].order) : 0
          const newOrderVal = firstOrder / 2
          api.updateTask(taskId, { columnId: targetColumnId, manualOrder: newOrderVal }).then(onRefresh).catch(console.error)
        } else {
          api.updateTask(taskId, { columnId: targetColumnId }).then(onRefresh).catch(console.error)
        }
      }
    }

    // Same-column reordering: dropped on another task
    if (overTask && overTask.columnId === task.columnId) {
      const column = board.columns.find(c => c.id === task.columnId)
      if (column && column.systemKey !== 'done' && column.systemKey !== 'backlog') {
        const colTasks = board.tasks
          .filter(t => t.columnId === task.columnId)
          .sort((a, b) => (a.manualOrder ?? a.order) - (b.manualOrder ?? b.order))

        const oldIndex = colTasks.findIndex(t => t.id === taskId)
        const newIndex = colTasks.findIndex(t => t.id === over.id)

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          // Calculate new manualOrder based on adjacent tasks at the target position
          // Tasks use manualOrder (ascending), lower values appear first
          let newOrderVal: number
          if (newIndex === 0) {
            // Moving to first position — use half of current first task's order, or -1 if none
            const firstOrder = colTasks.length > 0 ? (colTasks[0].manualOrder ?? colTasks[0].order) : 0
            newOrderVal = firstOrder / 2
          } else if (newIndex >= colTasks.length - 1) {
            // Moving to last position — use current last + 1 (or 1 if none)
            const last = colTasks[colTasks.length - 1]
            newOrderVal = colTasks.length > 0 ? (last.manualOrder ?? last.order) + 1 : 0
          } else {
            // Moving between two tasks — average of neighbors
            const before = colTasks[newIndex - 1]
            const after = colTasks[newIndex]
            const beforeOrder = before.manualOrder ?? before.order
            const afterOrder = after.manualOrder ?? after.order
            newOrderVal = (beforeOrder + afterOrder) / 2
          }
          console.log('[reorder]', { taskId, oldIndex, newIndex, newOrderVal })
          api.updateTask(taskId, { manualOrder: newOrderVal }).then(onRefresh).catch(console.error)
        }
      }
    }
  }

  function handleColumnDragStart(event: DragStartEvent) {
    document.body.style.overflow = 'hidden'
    const column = board.columns.find(c => c.id === event.active.id)
    if (column) setActiveColumn(column)
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    document.body.style.overflow = 'auto'
    const { active, over } = event
    setActiveColumn(null)

    if (!over || active.id === over.id) return

    const oldIndex = board.columns.findIndex(c => c.id === active.id)
    const newIndex = board.columns.findIndex(c => c.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    // Build new ordered columnIds array
    const columnIds = board.columns.map(c => c.id)
    columnIds.splice(oldIndex, 1)
    columnIds.splice(newIndex, 0, active.id as string)

    api.reorderColumns(columnIds).then(onRefresh).catch(console.error)
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

  return (
    <>
    <div className="board">
      <DndContext
        sensors={columnSensors}
        collisionDetection={closestCenter}
        onDragStart={handleColumnDragStart}
        onDragEnd={handleColumnDragEnd}
      >
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
          ) : null}
        </DragOverlay>
      </DndContext>

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

    {/* Task DndContext - separate from column DnD */}
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Task drag overlay - moved outside DndContext children */}
      <DragOverlay>
        {activeTask ? (
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
    </>
  )
}
