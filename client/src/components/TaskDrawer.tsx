import { useState, useEffect } from 'react'
import type { Task, TaskPriority } from '../types'
import { DONE_COLUMN_ID } from '../types'
import { api } from '../api'

type DrawerMode = 'create' | 'edit'

interface TaskDrawerProps {
  mode: DrawerMode
  task?: Task
  initialTitle?: string
  columnId: string
  onClose: () => void
  onSaved: () => void
}

export function TaskDrawer({
  mode,
  task,
  initialTitle = '',
  columnId,
  onClose,
  onSaved,
}: TaskDrawerProps) {
  const [title, setTitle] = useState(() =>
    mode === 'edit' && task ? task.title : initialTitle
  )
  const [description, setDescription] = useState(() =>
    mode === 'edit' && task ? task.description ?? '' : ''
  )
  const [doDate, setDoDate] = useState(() =>
    mode === 'edit' && task ? task.doDate ?? '' : ''
  )
  const [dueDate, setDueDate] = useState(() =>
    mode === 'edit' && task ? task.dueDate ?? '' : ''
  )
  const [priority, setPriority] = useState<TaskPriority | undefined>(() =>
    mode === 'edit' && task ? task.priority : undefined
  )
  const [assignee, setAssignee] = useState<'SL' | 'KL' | undefined>(() =>
    mode === 'edit' && task ? task.assignee : undefined
  )
  const [dateError, setDateError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const isCompleted = mode === 'edit' && task?.columnId === DONE_COLUMN_ID

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Date validation
  useEffect(() => {
    if (doDate && dueDate && dueDate < doDate) {
      setDateError('Due date cannot be earlier than do date.')
    } else {
      setDateError('')
    }
  }, [doDate, dueDate])

  const canSave =
    title.trim().length > 0 && !dateError && !saving

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      if (mode === 'create') {
        await api.createTask({
          title: title.trim(),
          columnId,
          description: description.trim() || undefined,
          doDate: doDate || undefined,
          dueDate: dueDate || undefined,
          priority,
          assignee,
        })
      } else if (task) {
        await api.updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          doDate: doDate || null,
          dueDate: dueDate || null,
          priority: priority ?? null,
          assignee: assignee ?? null,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkDone() {
    if (!task) return
    setSaving(true)
    try {
      await api.updateTask(task.id, {
        columnId: DONE_COLUMN_ID,
        completedAt: new Date().toISOString(),
      })
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark done')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!task) return
    const confirmed = window.confirm(
      'Delete this task? This action cannot be undone.'
    )
    if (!confirmed) return
    setSaving(true)
    try {
      await api.deleteTask(task.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    } finally {
      setSaving(false)
    }
  }

  function togglePriority(p: TaskPriority) {
    setPriority(prev => (prev === p ? undefined : p))
  }

  function toggleAssignee(a: 'SL' | 'KL') {
    setAssignee(prev => (prev === a ? undefined : a))
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="task-drawer" onClick={e => e.stopPropagation()}>
        <div className="task-drawer-header">
          <h2>{mode === 'edit' && task ? task.title : 'New task'}</h2>
          <button
            className="task-drawer-close"
            onClick={onClose}
            aria-label="Close drawer"
          >
            ×
          </button>
        </div>

        <div className="task-drawer-body">
          <div className="task-drawer-field">
            <label htmlFor="task-title">Title</label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Task title"
              autoFocus
              readOnly={isCompleted}
            />
          </div>

          <div className="task-drawer-field">
            <label htmlFor="task-description">Description</label>
            <textarea
              id="task-description"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Add description..."
              readOnly={isCompleted}
            />
          </div>

          <div className="task-drawer-row">
            <div className="task-drawer-field">
              <label htmlFor="task-do-date">Do date</label>
              <input
                id="task-do-date"
                type="date"
                value={doDate}
                onChange={e => setDoDate(e.target.value)}
                disabled={isCompleted}
              />
            </div>
            <div className="task-drawer-field">
              <label htmlFor="task-due-date">Due date</label>
              <input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                disabled={isCompleted}
              />
            </div>
          </div>

          {dateError && <p className="drawer-error">{dateError}</p>}
          {error && <p className="drawer-error">{error}</p>}

          <div className="task-drawer-field">
            <label>Priority</label>
            <div className="task-drawer-btn-group">
              <button
                type="button"
                className={`priority-low${priority === 'low' ? ' selected' : ''}`}
                onClick={() => togglePriority('low')}
                disabled={isCompleted}
              >
                Low
              </button>
              <button
                type="button"
                className={`priority-medium${priority === 'medium' ? ' selected' : ''}`}
                onClick={() => togglePriority('medium')}
                disabled={isCompleted}
              >
                Med
              </button>
              <button
                type="button"
                className={`priority-high${priority === 'high' ? ' selected' : ''}`}
                onClick={() => togglePriority('high')}
                disabled={isCompleted}
              >
                High
              </button>
              <button
                type="button"
                className={`priority-none${priority === undefined ? ' selected' : ''}`}
                onClick={() => setPriority(undefined)}
                disabled={isCompleted}
              >
                None
              </button>
            </div>
          </div>

          <div className="task-drawer-field">
            <label>Assignee</label>
            <div className="task-drawer-btn-group">
              <button
                type="button"
                className={`assignee-sl${assignee === 'SL' ? ' selected' : ''}`}
                onClick={() => toggleAssignee('SL')}
                disabled={isCompleted}
              >
                SL
              </button>
              <button
                type="button"
                className={`assignee-kl${assignee === 'KL' ? ' selected' : ''}`}
                onClick={() => toggleAssignee('KL')}
                disabled={isCompleted}
              >
                KL
              </button>
              <button
                type="button"
                className={assignee === undefined ? 'selected' : ''}
                onClick={() => setAssignee(undefined)}
                disabled={isCompleted}
              >
                None
              </button>
            </div>
          </div>
        </div>

        <div className="task-drawer-actions">
          <div className="primary-actions">
            <button
              className="btn-save"
              onClick={handleSave}
              disabled={!canSave || (mode === 'edit' && task?.columnId === DONE_COLUMN_ID)}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        </div>

        {mode === 'edit' && task && (
          <div className="task-drawer-danger-zone">
            {task.columnId !== DONE_COLUMN_ID && (
              <button
                className="btn-danger-full btn-mark-done"
                onClick={handleMarkDone}
                disabled={saving}
              >
                Mark done
              </button>
            )}
            <button
              className="btn-danger-full btn-delete"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete task
            </button>
          </div>
        )}
      </div>
    </div>
  )
}