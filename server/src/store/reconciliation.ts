import type { Board, Task } from '../types.js'
import { TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'

/**
 * Checks if a single task should be promoted to Today.
 * Returns the promoted task (with updated columnId) or null if not eligible.
 */
export function reconcileTask(task: Task, today: string): Task | null {
  // Already in Today or Done — skip
  if (task.columnId === TODAY_COLUMN_ID || task.columnId === DONE_COLUMN_ID) {
    return null
  }

  // Today promotion rule
  const doDateOk = task.doDate != null && task.doDate <= today
  const dueDateFallback =
    task.doDate == null &&
    task.dueDate != null &&
    task.dueDate <= today

  if (doDateOk || dueDateFallback) {
    return { ...task, columnId: TODAY_COLUMN_ID }
  }

  return null
}

/**
 * Reconciles all tasks in the board.
 * Returns an array of all promoted tasks (empty array if none).
 * Does NOT persist — caller is responsible for writing the board.
 */
export function reconcileBoard(board: Board, today: string): Task[] {
  const promoted: Task[] = []
  for (const task of board.tasks) {
    const promotedTask = reconcileTask(task, today)
    if (promotedTask) {
      Object.assign(task, promotedTask)
      promoted.push(promotedTask)
    }
  }
  return promoted
}