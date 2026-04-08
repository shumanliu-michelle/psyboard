import express from 'express'
import { Router } from 'express'
import { createTask, updateTask, deleteTask, readBoard, reorderTasks, ConflictError } from '../store/boardStore.js'
import type { CreateTaskInput, UpdateTaskInput, Task } from '../types.js'
import { DONE_COLUMN_ID } from '../types.js'
import { CronExpressionParser } from 'cron-parser'
import type { RecurrenceConfig } from '../types.js'
import { broadcast, type BroadcastSummary } from './events.js'

function getTabId(req: express.Request): string | undefined {
  return req.headers['x-tab-id'] as string | undefined
}

function getSource(req: express.Request): 'tab' | 'psyduck' {
  return req.headers['x-source'] === 'psyduck' ? 'psyduck' : 'tab'
}

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

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type TaskFilter = (task: Task) => boolean

function parseFilterParam(raw: string): { field: string; operator: string; value: string } {
  // Two formats supported:
  // 1. Old: field=operator:value (e.g. "title=cont:searchterm", "columnId=eq:col-backlog")
  //    Separator is ':', value may contain '=' (e.g. timestamps like "2026-04-06T05:00:00.000Z")
  // 2. New: field=operator=value (e.g. "columnId=eq=col-done")
  //    Separator is '=', value may contain ':' (ISO timestamps)
  //
  // Detection: if ':' appears in rest AND (no '=' in rest OR ':' comes before first '='), use ':' as separator.
  // Otherwise use '=' as separator.
  const equalsIdx = raw.indexOf('=')
  if (equalsIdx === -1) return { field: raw, operator: 'eq', value: '' }
  const field = raw.slice(0, equalsIdx)
  const rest = raw.slice(equalsIdx + 1)

  const colonIdx = rest.indexOf(':')
  const secondEqualsIdx = rest.indexOf('=')

  // Use ':' as separator (old format) if:
  // - ':' exists AND (no '=' in rest OR ':' comes before first '=' in rest)
  if (colonIdx !== -1 && (secondEqualsIdx === -1 || colonIdx < secondEqualsIdx)) {
    const operator = rest.slice(0, colonIdx)
    const value = rest.slice(colonIdx + 1)
    return { field, operator, value }
  }

  // Use '=' as separator (new format) if '=' exists in rest
  if (secondEqualsIdx !== -1) {
    const operator = rest.slice(0, secondEqualsIdx)
    const value = rest.slice(secondEqualsIdx + 1)
    return { field, operator, value }
  }

  // No separator — bare value with default 'eq' operator
  return { field, operator: 'eq', value: rest }
}

function buildTaskFilter(field: string, operator: string, rawValue: string): TaskFilter | null {
  switch (field) {
    case 'columnId':
    case 'priority':
    case 'assignee': {
      return (task) => {
        const fieldValue = (task as any)[field] as string | undefined
        if (operator === 'eq') return fieldValue === rawValue
        if (operator === 'ne') return fieldValue !== rawValue
        return false
      }
    }
    case 'title': {
      if (operator === 'cont') {
        return (task) => (task.title || '').toLowerCase().includes(rawValue.toLowerCase())
      }
      return null
    }
    case 'dueDate':
    case 'doDate':
    case 'completedAt': {
      return (task) => {
        const dateVal = (task as any)[field] as string | undefined
        if (!dateVal) return false
        const taskMs = new Date(dateVal).getTime()
        const queryMs = new Date(rawValue).getTime()
        switch (operator) {
          case 'eq': return dateVal === rawValue
          case 'gte': return taskMs >= queryMs
          case 'gt': return taskMs > queryMs
          case 'lte': return taskMs <= queryMs
          case 'lt': return taskMs < queryMs
          default: return false
        }
      }
    }
    default:
      return null
  }
}

router.get('/', (req, res) => {
  const { limit: limitStr, offset: offsetStr, sortBy, sortDir } = req.query as Record<string, string>

  // Collect *Op params (e.g. completedAtOp=lt) for bare field operators
  const opParams: Record<string, string> = {}
  for (const [key, val] of Object.entries(req.query)) {
    if (key.endsWith('Op') && typeof val === 'string') {
      opParams[key] = val
    }
  }

  // Collect filters from all query params except limit/offset/sortBy/sortDir and *Op params
  const filters: TaskFilter[] = []
  const metaParams = new Set(['limit', 'offset', 'sortBy', 'sortDir'])

  for (const [key, rawVal] of Object.entries(req.query)) {
    if (metaParams.has(key)) continue
    if (key.endsWith('Op')) continue  // skip *Op params, handled via opParams lookup
    // Handle array values from duplicate query params (e.g., dueDate=gte:...&dueDate=lte:...)
    const rawVals = Array.isArray(rawVal) ? rawVal : [rawVal]
    for (const rv of rawVals) {
      if (typeof rv !== 'string') continue

      const { field, operator: embeddedOp, value: parsedValue } = parseFilterParam(key)
      if (metaParams.has(field)) continue
      if (!field) continue

      let operator: string
      let value: string

      if (key !== field) {
        // Composite format: key is "field=operator" or "field=operator=value" (embedded operator)
        // value is in rv (from URLSearchParams)
        operator = embeddedOp
        value = rv
      } else {
        // Bare field: key is just "field", value is in rv
        // Look up operator from *Op param (e.g. completedAtOp=lt) if provided
        const opKey = field + 'Op'
        const explicitOp = opParams[opKey]
        if (explicitOp) {
          operator = explicitOp
          value = rv
        } else if (rv !== undefined) {
          // Check if rv is "operator:value" (old format like "eq:col-backlog")
          // Only use ":" as separator if rawVal actually contains ":"
          const colonIdx = rv.indexOf(':')

          if (colonIdx !== -1) {
            // ":" in rawVal — old format: operator:value
            operator = rv.slice(0, colonIdx)
            value = rv.slice(colonIdx + 1)
          } else {
            // No ":" in rawVal — bare value (could be timestamp or plain value)
            operator = field === 'title' ? 'cont' : 'eq'
            value = rv
          }
        } else {
          operator = embeddedOp
          value = rv
        }
      }

      if (!value) continue

      // Validate date fields
      if ((field === 'dueDate' || field === 'doDate' || field === 'completedAt') && operator !== 'cont') {
        const parsed = new Date(value)
        if (isNaN(parsed.getTime())) {
          res.status(400).json({ error: `Invalid date value for ${field}: ${value}` })
          return
        }
      }

      const filterFn = buildTaskFilter(field, operator, value)
      if (filterFn === null) {
        res.status(400).json({ error: `Unknown filter field or operator: ${key}=${rv}` })
        return
      }
      filters.push(filterFn)
    }
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitStr) || DEFAULT_LIMIT))
  const offset = Math.max(0, parseInt(offsetStr) || 0)

  try {
    const board = readBoard()

    let filtered = board.tasks.filter(task => filters.every(f => f(task)))

    // Detect if this is a Done column query (columnId=eq:col-done)
    const isDoneQuery = filters.some(f => {
      return f({ columnId: DONE_COLUMN_ID } as Task)
    })

    const effectiveSortBy = sortBy || (isDoneQuery ? 'completedAt' : 'dueDate')
    const effectiveSortDir = sortDir || (isDoneQuery ? 'desc' : 'asc')

    const PRIORITY_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 }

    filtered.sort((a, b) => {
      let aVal: number | string, bVal: number | string
      switch (effectiveSortBy) {
        case 'completedAt':
          aVal = a.completedAt ? new Date(a.completedAt).getTime() : 0
          bVal = b.completedAt ? new Date(b.completedAt).getTime() : 0
          break
        case 'dueDate':
          aVal = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          bVal = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          break
        case 'doDate':
          aVal = a.doDate ? new Date(a.doDate).getTime() : Infinity
          bVal = b.doDate ? new Date(b.doDate).getTime() : Infinity
          break
        case 'priority':
          aVal = PRIORITY_WEIGHT[a.priority || 'medium']
          bVal = PRIORITY_WEIGHT[b.priority || 'medium']
          break
        case 'order':
          aVal = a.order; bVal = b.order; break
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime(); bVal = new Date(b.createdAt).getTime(); break
        default:
          aVal = a.order; bVal = b.order
      }
      if (aVal < bVal) return effectiveSortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return effectiveSortDir === 'asc' ? 1 : -1
      return 0
    })

    const totalMatching = filtered.length
    const page = filtered.slice(offset, offset + limit)
    const hasMore = offset + limit < totalMatching

    res.json({ tasks: page, hasMore })
  } catch {
    res.status(500).json({ error: 'Failed to query tasks' })
  }
})

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
    const summary: BroadcastSummary = { source: getSource(req), created: [task], updated: [], deleted: [] }
    res.status(201).json(task)
    broadcast(getTabId(req), summary)
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
      assignee: updates.assignee !== undefined ? updates.assignee : undefined,
      doDate: updates.doDate,
      dueDate: updates.dueDate,
      priority: updates.priority !== undefined ? updates.priority : undefined,
      completedAt: updates.completedAt,
      recurrence: updates.recurrence as import('../types.js').RecurrenceConfig | null | undefined,
      suppressNextOccurrence: updates.suppressNextOccurrence,
      expectedUpdatedAt: updates.expectedUpdatedAt,
    })
    const summary: BroadcastSummary = { source: getSource(req), created: [], updated: [task], deleted: [] }
    res.json(task)
    broadcast(getTabId(req), summary)
  } catch (err: unknown) {
    if (err instanceof ConflictError) {
      res.status(409).json({ error: 'Task was modified by someone else. Please reload and try again.', currentTask: err.currentTask })
      return
    }
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

  // Check if task exists
  const board = readBoard()
  const task = board.tasks.find(t => t.id === id)
  if (!task) {
    res.status(404).json({ error: 'Task not found' })
    return
  }

  try {
    const taskTitle = task.title
    deleteTask(id)
    const summary: BroadcastSummary = { source: getSource(req), created: [], updated: [], deleted: [taskTitle] }
    broadcast(getTabId(req), summary)
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
    const movedTask = tasks.find(t => t.id === taskId)
    const summary: BroadcastSummary = { source: getSource(req), created: [], updated: movedTask ? [movedTask] : [], deleted: [] }
    broadcast(getTabId(req), summary)
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
