import { readBoard, createTask } from '../store/boardStore.js'
import { TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import type { TriggeredAlert } from './alertEngine.js'

function todayString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type TaskCreationResult = {
  alert: TriggeredAlert
  action: 'created' | 'skipped'
}

/**
 * Idempotent task creation: for each triggered alert, check if an open (non-Done)
 * task already has the same title. If so, skip — the alert was already handled.
 * Tasks in Done are excluded so a re-trigger after completion creates a new task.
 */
export function createTasksForAlerts(alerts: TriggeredAlert[]): TaskCreationResult[] {
  const board = readBoard()
  // Only check non-Done tasks — a completed task should not block re-creation
  const openTasks = board.tasks.filter(t => t.columnId !== DONE_COLUMN_ID)

  const results: TaskCreationResult[] = []

  for (const alert of alerts) {
    const exists = openTasks.some(t => t.title === alert.taskTitle)
    if (exists) {
      results.push({ alert, action: 'skipped' })
    } else {
      // high priority → doDate + dueDate = today; medium → no dates
      const doDate = alert.priority === 'high' ? todayString() : undefined
      const dueDate = alert.priority === 'high' ? todayString() : undefined

      createTask(alert.taskTitle, TODAY_COLUMN_ID, undefined, doDate, dueDate, alert.priority)
      results.push({ alert, action: 'created' })
    }
  }

  return results
}
