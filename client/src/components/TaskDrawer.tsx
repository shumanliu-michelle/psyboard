import { useState, useEffect } from 'react'
import type { Task, TaskPriority, RecurrenceConfig, RecurrenceKind } from '../types'
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
  const [recurrence, setRecurrence] = useState<RecurrenceConfig | undefined>(() =>
    mode === 'edit' && task ? task.recurrence : undefined
  )
  const [recurrenceError, setRecurrenceError] = useState('')
  const [dateError, setDateError] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 'single' = delete this occurrence, 'all' = delete all future, 'non-recurring' = delete task
  const [pendingDelete, setPendingDelete] = useState<'single' | 'all' | 'non-recurring' | null>(null)

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

  // Recurrence validation
  useEffect(() => {
    if (recurrence) {
      const hasDoDate = doDate && doDate.length > 0
      const hasDueDate = dueDate && dueDate.length > 0
      if (!hasDoDate && !hasDueDate) {
        setRecurrenceError('Recurring tasks must have at least a do date or due date.')
      } else if (recurrence.kind === 'interval_days' && (!recurrence.intervalDays || recurrence.intervalDays < 1)) {
        setRecurrenceError('Interval must be at least 1 day.')
      } else {
        setRecurrenceError('')
      }
    } else {
      setRecurrenceError('')
    }
  }, [recurrence, doDate, dueDate])

  const canSave =
    title.trim().length > 0 && !dateError && !recurrenceError && !saving

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
          recurrence,
        })
      } else if (task) {
        await api.updateTask(task.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          doDate: doDate || null,
          dueDate: dueDate || null,
          priority: priority ?? null,
          assignee: assignee ?? null,
          recurrence: recurrence ?? null,
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

  async function handleDeleteSingle() {
    if (!task) return
    setSaving(true)
    try {
      // Move to Done first (creates next occurrence), then delete this task
      await api.updateTask(task.id, { columnId: DONE_COLUMN_ID })
      await api.deleteTask(task.id)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete task')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAll() {
    if (!task) return
    setSaving(true)
    try {
      // Suppress next occurrence (completes without creating next), then delete
      await api.updateTask(task.id, {
        columnId: DONE_COLUMN_ID,
        suppressNextOccurrence: true,
      })
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
                className={`assignee-none${assignee === undefined ? ' selected' : ''}`}
                onClick={() => setAssignee(undefined)}
                disabled={isCompleted}
              >
                None
              </button>
            </div>
          </div>

          <div className="task-drawer-field">
            <label htmlFor="task-recurrence">Repeat</label>
            <select
              id="task-recurrence"
              value={recurrence?.kind ?? ''}
              onChange={e => {
                const kind = e.target.value as RecurrenceKind | ''
                if (!kind) { setRecurrence(undefined); return }
                setRecurrence({
                  kind,
                  mode: recurrence?.mode ?? 'fixed',
                  ...(kind === 'interval_days' ? { intervalDays: 1 } : {}),
                })
              }}
              disabled={isCompleted}
            >
              <option value="">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="interval_days">Every X days</option>
              <option value="weekdays">Weekdays only</option>
            </select>
          </div>

          {recurrence?.kind === 'interval_days' && (
            <div className="task-drawer-row">
              <div className="task-drawer-field" style={{ flex: 1 }}>
                <label htmlFor="recurrence-interval">Every</label>
                <input
                  id="recurrence-interval"
                  type="number"
                  min="1"
                  value={recurrence.intervalDays ?? 1}
                  onChange={e => setRecurrence(prev => prev ? {
                    ...prev, intervalDays: parseInt(e.target.value) || 1
                  } : prev)}
                  disabled={isCompleted}
                />
              </div>
              <span style={{ alignSelf: 'center'}}>days</span>
            </div>
          )}

          {recurrence?.kind === 'cron' && (
            <div className="task-drawer-field">
              <label htmlFor="recurrence-cron">Cron expression</label>
              <input
                id="recurrence-cron"
                type="text"
                placeholder="0 9 * * *"
                value={recurrence.cronExpr ?? ''}
                onChange={e => setRecurrence(prev => prev ? {
                  ...prev, cronExpr: e.target.value
                } : prev)}
                disabled={isCompleted}
              />
            </div>
          )}

          {recurrence && (
            <div className="task-drawer-field">
              <label>Mode</label>
              <div className="task-drawer-btn-group">
                <button
                  type="button"
                  className={recurrence.mode === 'fixed' ? 'selected' : ''}
                  onClick={() => setRecurrence(prev => prev ? { ...prev, mode: 'fixed' } : prev)}
                  disabled={isCompleted}
                >
                  Fixed schedule
                </button>
                <button
                  type="button"
                  className={recurrence.mode === 'completion_based' ? 'selected' : ''}
                  onClick={() => setRecurrence(prev => prev ? { ...prev, mode: 'completion_based' } : prev)}
                  disabled={isCompleted}
                >
                  Completion-based
                </button>
              </div>
            </div>
          )}

          {recurrenceError && <p className="drawer-error">{recurrenceError}</p>}
          {dateError && <p className="drawer-error">{dateError}</p>}
          {error && <p className="drawer-error">{error}</p>}
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
            {task.recurrence ? (
              <>
                <button
                  className="btn-danger-full btn-delete"
                  onClick={() => { setPendingDelete('single'); setConfirmDelete(true) }}
                  disabled={saving}
                >
                  Delete this occurrence
                </button>
                <button
                  className="btn-danger-full btn-delete"
                  onClick={() => { setPendingDelete('all'); setConfirmDelete(true) }}
                  disabled={saving}
                >
                  Delete all future occurrences
                </button>
              </>
            ) : (
              <button
                className="btn-danger-full btn-delete"
                onClick={() => { setPendingDelete('non-recurring'); setConfirmDelete(true) }}
                disabled={saving}
              >
                Delete task
              </button>
            )}
          </div>
        )}

        {confirmDelete && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
          }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 24, maxWidth: 300, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}>
              <p style={{ marginBottom: 16 }}>
                {pendingDelete === 'single' && 'Delete this occurrence? A new task will be created for the next occurrence.'}
                {pendingDelete === 'all' && 'Delete all future occurrences of this recurring task?'}
                {pendingDelete === 'non-recurring' && 'Delete this task? This action cannot be undone.'}
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setConfirmDelete(false); setPendingDelete(null) }}
                  style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: 6, border: '1px solid var(--border-default)', background: 'white' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(false)
                    if (pendingDelete === 'single') handleDeleteSingle()
                    else if (pendingDelete === 'all') handleDeleteAll()
                    else handleDeleteSingle() // non-recurring
                    setPendingDelete(null)
                  }}
                  style={{ padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}