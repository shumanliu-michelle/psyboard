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
import type { Board, Task } from '../types'
import { ColumnCard } from './ColumnCard'
import { AddColumnForm } from './AddColumnForm'
import { api } from '../api'

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
  const [showAddColumn, setShowAddColumn] = useState(false)

  const sensors = useSensors(
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
        // Move to new column
        api.updateTask(taskId, { columnId: targetColumnId }).then(onRefresh).catch(console.error)
      }
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
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
                onOpenDrawer={() => {}}
              />
            )
          })}

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
        {activeTask ? (
          <div className="task-card" data-dnd-drag-overlay style={{ opacity: 0.9, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
            <div className="task-card-title">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
