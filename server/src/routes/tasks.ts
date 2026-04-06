import { Router } from 'express'
import { createTask, updateTask, deleteTask, readBoard, reorderTasks } from '../store/boardStore.js'
import type { CreateTaskInput, UpdateTaskInput, Task } from '../types.js'
import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig } from '../types.js'

function validateRecurrenceInput(
  recurrence: RecurrenceConfig | undefined | null,
  doDate?: string | null,
  dueDate?: string | null,
  existingTask?: Task | null
): string | null {
  if (recurrence === undefined || recurrence === null) return null
  const hasDoDate = doDate && doDate.length > 0
  const hasDueDate = dueDate && dueDate.length > 0
  if (!hasDoDate && !hasDueDate && existingTask) {
    const taskHasDoDate = existingTask.doDate && existingTask.doDate.length > 0
    const taskHasDueDate = existingTask.dueDate && existingTask.dueDate.length > 0
    if (!taskHasDoDate && !taskHasDueDate) {
      return 'Recurring tasks must have at least a do date or due date.'
    }
  } else if (!hasDoDate && !hasDueDate) {
    return 'Recurring tasks must have at least a do date or due date.'
  }
  if (recurrence.kind === 'interval_days') {
    if (!recurrence.intervalDays || recurrence.intervalDays < 1) {
      return 'Interval must be at least 1 day.'
    }
  }
  if (recurrence.kind === 'cron') {
    if (!recurrence.cronExpr) return 'Invalid recurrence rule.'
    try {
      CronExpressionParser.parse(recurrence.cronExpr, { currentDate: new Date() })
    } catch {
      return 'Invalid recurrence rule.'
    }
  }
  return null
}

const router = Router()

router.post('/', (req, res) => {
  const { title, columnId, description, doDate, dueDate, priority, assignee, recurrence } = req.body as CreateTaskInput

  // Validate
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ error: 'Task title is required and must be non-empty' })
    return
  }
  if (!columnId || typeof columnId !== 'string') {
    res.status(400).json({ error: 'columnId is required' })
    return
  }

  // Validate doDate/dueDate if both present
  if (doDate && dueDate && doDate.length > 0 && dueDate.length > 0) {
    if (dueDate < doDate) {
      res.status(400).json({ error: 'dueDate must be on or after doDate' })
      return
    }
  }

  // Validate priority
  if (priority !== undefined && !['low', 'medium', 'high'].includes(priority)) {
    res.status(400).json({ error: 'priority must be low, medium, or high' })
    return
  }

  // Validate assignee
  if (assignee !== undefined && assignee !== null && !['SL', 'KL'].includes(assignee)) {
    res.status(400).json({ error: 'assignee must be SL, KL, or null' })
    return
  }

  // Validate recurrence
  const validationError = validateRecurrenceInput(recurrence, doDate, dueDate)
  if (validationError) {
    res.status(400).json({ error: validationError })
    return
  }

  // Verify column exists
  const board = readBoard()
  const column = board.columns.find(c => c.id === columnId)
  if (!column) {
    res.status(400).json({ error: 'Column not found' })
    return
  }

  try {
    const task = createTask(
      title.trim(),
      columnId,
      description?.trim() || undefined,
      doDate?.trim() || null,
      dueDate?.trim() || null,
      priority,
      assignee ?? undefined,
      recurrence
    )
    res.status(201).json(task)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' })
  }
})

router.patch('/:id', (req, res) => {
  const { id } = req.params
  const updates = req.body as UpdateTaskInput

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid task ID' })
    return
  }

  // Validate doDate/dueDate if both present
  if (updates.doDate && updates.dueDate && updates.doDate.length > 0 && updates.dueDate.length > 0) {
    if (updates.dueDate < updates.doDate) {
      res.status(400).json({ error: 'dueDate must be on or after doDate' })
      return
    }
  }

  // Validate priority
  if (updates.priority !== undefined && updates.priority !== null && !['low', 'medium', 'high'].includes(updates.priority)) {
    res.status(400).json({ error: 'priority must be low, medium, or high' })
    return
  }

  // Validate assignee
  if (updates.assignee !== undefined && updates.assignee !== null && !['SL', 'KL'].includes(updates.assignee)) {
    res.status(400).json({ error: 'assignee must be SL, KL, or null' })
    return
  }

  // Validate recurrence
  const board = readBoard()
  const existingTask = board.tasks.find(t => t.id === id) ?? undefined
  const patchValidationError = validateRecurrenceInput(
    updates.recurrence,
    updates.doDate,
    updates.dueDate,
    existingTask
  )
  if (patchValidationError) {
    res.status(400).json({ error: patchValidationError })
    return
  }

  // If changing columnId, verify it exists
  if (updates.columnId) {
    const board = readBoard()
    const column = board.columns.find(c => c.id === updates.columnId)
    if (!column) {
      res.status(400).json({ error: 'Column not found' })
      return
    }
  }

  try {
    const task = updateTask(id, {
      title: updates.title,
      description: updates.description,
      columnId: updates.columnId,
      order: updates.order,
      assignee: updates.assignee ?? undefined,
      doDate: updates.doDate,
      dueDate: updates.dueDate,
      priority: updates.priority ?? undefined,
      completedAt: updates.completedAt,
      recurrence: updates.recurrence as import('../types.js').RecurrenceConfig | null | undefined,
      suppressNextOccurrence: updates.suppressNextOccurrence,
    })
    res.json(task)
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: 'Task not found' })
      return
    }
    res.status(500).json({ error: 'Failed to update task' })
  }
})

router.delete('/:id', (req, res) => {
  const { id } = req.params

  if (!id || id.length < 10) {
    res.status(400).json({ error: 'Invalid task ID' })
    return
  }

  try {
    deleteTask(id)
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task' })
  }
})

router.post('/reorder', (req, res) => {
  const { taskId, targetColumnId, newIndex } = req.body as {
    taskId?: string
    targetColumnId?: string
    newIndex?: number
  }

  if (!taskId || typeof taskId !== 'string' || taskId.length < 10) {
    res.status(400).json({ error: 'Invalid taskId' })
    return
  }
  if (!targetColumnId || typeof targetColumnId !== 'string') {
    res.status(400).json({ error: 'Invalid targetColumnId' })
    return
  }
  if (typeof newIndex !== 'number' || newIndex < 0 || !Number.isInteger(newIndex)) {
    res.status(400).json({ error: 'newIndex must be a non-negative integer' })
    return
  }

  try {
    const tasks = reorderTasks(taskId, targetColumnId, newIndex)
    res.json({ tasks })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('not found')) {
      res.status(404).json({ error: err.message })
      return
    }
    res.status(500).json({ error: 'Failed to reorder tasks' })
  }
})

export default router
