import { useState } from 'react'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import type { Column, Task } from '../types'
import { TaskCard } from './TaskCard'
import { AddTaskForm } from './AddTaskForm'
import { api } from '../api'

interface ColumnCardProps {
  column: Column
  tasks: Task[]
  onRefresh: () => void
}

export function ColumnCard({ column, tasks, onRefresh }: ColumnCardProps) {
  const [showAddForm, setShowAddForm] = useState(false)

  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  async function handleDeleteColumn() {
    if (!confirm(`Delete column "${column.title}" and all its tasks?`)) return
    try {
      await api.deleteColumn(column.id)
      onRefresh()
    } catch (err) {
      console.error('Failed to delete column:', err)
    }
  }

  return (
    <div
      className="column"
      style={{ background: isOver ? '#dde' : undefined }}
    >
      <div className="column-header">
        <h3>{column.title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="task-count">{tasks.length}</span>
          <button className="column-delete" onClick={handleDeleteColumn} title="Delete column">
            ×
          </button>
        </div>
      </div>

      <div ref={setNodeRef} className="column-tasks">
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdated={onRefresh}
              onDeleted={onRefresh}
            />
          ))}
        </SortableContext>
      </div>

      {showAddForm ? (
        <AddTaskForm
          columnId={column.id}
          onAdded={() => { setShowAddForm(false); onRefresh() }}
          onCancel={() => setShowAddForm(false)}
        />
      ) : (
        <button className="add-task-btn" onClick={() => setShowAddForm(true)}>
          + Add task
        </button>
      )}
    </div>
  )
}
