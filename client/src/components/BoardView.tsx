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
    const task = board.tasks.find(t => t.id === event.active.id)
    if (task) setActiveTask(task)
  }

  function handleDragEnd(event: DragEndEvent) {
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
          .sort((a, b) => a.order - b.order)
          .map(column => {
            const columnTasks = board.tasks
              .filter(t => t.columnId === column.id)
              .sort((a, b) => a.order - b.order)
            return (
              <ColumnCard
                key={column.id}
                column={column}
                tasks={columnTasks}
                onRefresh={onRefresh}
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
          <div className="task-card" style={{ opacity: 0.9, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
            <div className="task-card-title">{activeTask.title}</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
