import { readBoard, createTask } from '../store/boardStore.js'
import { TODAY_COLUMN_ID } from '../types.js'
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
 * Idempotent task creation: for each triggered alert, check if an open task
 * in the Today column already has the same title. If not, create it.
 */
export function createTasksForAlerts(alerts: TriggeredAlert[]): TaskCreationResult[] {
  const board = readBoard()
  const todayTasks = board.tasks.filter(t => t.columnId === TODAY_COLUMN_ID)

  const results: TaskCreationResult[] = []

  for (const alert of alerts) {
    const exists = todayTasks.some(t => t.title === alert.taskTitle)
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
