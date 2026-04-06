import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { DONE_COLUMN_ID, TODAY_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import type { Board } from '../types.js'
import { computeNextDate } from '../store/recurrence.js'
import type { RecurrenceConfig } from '../types.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('PATCH /api/tasks/:id — completedAt behavior', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  async function createTask(title: string, columnId: string) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title, columnId })
    return res.body
  }

  it('sets completedAt when moving a task to Done', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()
    expect(new Date(res.body.completedAt)).toBeInstanceOf(Date)
  })

  it('clears completedAt when moving a task out of Done', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    await request(app).patch(`/api/tasks/${task.id}`).send({ columnId: DONE_COLUMN_ID })
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: TODAY_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeUndefined()
  })

  it('keeps completedAt when updating a task already in Done without changing column', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    await request(app).patch(`/api/tasks/${task.id}`).send({ columnId: DONE_COLUMN_ID })
    const firstCompletedAt = (await request(app).patch(`/api/tasks/${task.id}`).send({ title: 'New title' })).body.completedAt
    const res = await request(app).patch(`/api/tasks/${task.id}`).send({ title: 'Updated again' })
    expect(res.body.completedAt).toBe(firstCompletedAt)
  })
})

describe('POST /api/tasks — date validation', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('returns 400 when dueDate is before doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-10', dueDate: '2026-04-01' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('dueDate must be on or after doDate')
  })

  it('accepts task when dueDate equals doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-05', dueDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })

  it('accepts task with only doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, doDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })

  it('accepts task with only dueDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test', columnId: BACKLOG_COLUMN_ID, dueDate: '2026-04-05' })
    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/tasks/:id — date validation', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  async function createTask(title: string, columnId: string) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title, columnId })
    return res.body
  }

  it('returns 400 when dueDate is before doDate on update', async () => {
    const task = await createTask('Test task', BACKLOG_COLUMN_ID)
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ doDate: '2026-04-10', dueDate: '2026-04-01' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('dueDate must be on or after doDate')
  })
})

describe('computeNextDate', () => {
  const fixedConfig: RecurrenceConfig = { kind: 'daily', mode: 'fixed' }

  it('returns next day for daily recurrence', () => {
    const result = computeNextDate('2026-04-05', 'daily', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-06')
  })

  it('returns null when currentDate is null', () => {
    const result = computeNextDate(null, 'daily', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBeNull()
  })

  it('advances 7 days for weekly recurrence', () => {
    const result = computeNextDate('2026-04-05', 'weekly', fixedConfig, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-12')
  })

  it('advances to next month for monthly recurrence', () => {
    const result = computeNextDate('2026-04-15', 'monthly', fixedConfig, '2026-04-15T10:00:00Z')
    expect(result).toBe('2026-05-15')
  })

  it('caps day-of-month to last day if needed', () => {
    const config: RecurrenceConfig = { kind: 'monthly', mode: 'fixed', dayOfMonth: 31 }
    const result = computeNextDate('2026-01-31', 'monthly', config, '2026-01-31T10:00:00Z')
    // Feb doesn't have 31 days — should cap to 28
    expect(result).toBe('2026-02-28')
  })

  it('advances by intervalDays for interval_days recurrence', () => {
    const config: RecurrenceConfig = { kind: 'interval_days', mode: 'fixed', intervalDays: 5 }
    const result = computeNextDate('2026-04-05', 'interval_days', config, '2026-04-05T10:00:00Z')
    expect(result).toBe('2026-04-10')
  })

  it('skips weekends for weekdays recurrence', () => {
    // 2026-04-03 is a Friday
    const result = computeNextDate('2026-04-03', 'weekdays', fixedConfig, '2026-04-03T10:00:00Z')
    // Next weekday after Friday is Monday April 6
    expect(result).toBe('2026-04-06')
  })

  it('returns next cron occurrence for cron kind', () => {
    const config: RecurrenceConfig = { kind: 'cron', mode: 'fixed', cronExpr: '0 9 * * *' }
    const result = computeNextDate('2026-04-05', 'cron', config, '2026-04-05T10:00:00Z')
    // 10am on Apr 5 is past 9am, so next is 9am on Apr 6
    expect(result).toBe('2026-04-06')
  })
})

describe('POST /api/tasks — recurrence validation', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('returns 400 when recurrence set but no doDate or dueDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Recurring task', columnId: BACKLOG_COLUMN_ID, recurrence: { kind: 'daily', mode: 'fixed' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Recurring tasks must have at least a do date or due date.')
  })

  it('returns 400 when interval_days has intervalDays < 1', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Bad interval',
        columnId: BACKLOG_COLUMN_ID,
        doDate: '2026-04-05',
        recurrence: { kind: 'interval_days', mode: 'fixed', intervalDays: 0 },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Interval must be at least 1 day.')
  })

  it('returns 400 when cron kind has invalid cronExpr', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Bad cron',
        columnId: BACKLOG_COLUMN_ID,
        doDate: '2026-04-05',
        recurrence: { kind: 'cron', mode: 'fixed', cronExpr: 'not-a-cron' },
      })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid recurrence rule.')
  })

  it('accepts valid recurrence with doDate', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Valid daily',
        columnId: BACKLOG_COLUMN_ID,
        doDate: '2026-04-05',
        recurrence: { kind: 'daily', mode: 'fixed' },
      })
    expect(res.status).toBe(201)
    expect(res.body.recurrence).toEqual({ kind: 'daily', mode: 'fixed' })
  })

  it('accepts valid recurrence with dueDate only', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Valid daily',
        columnId: BACKLOG_COLUMN_ID,
        dueDate: '2026-04-05',
        recurrence: { kind: 'daily', mode: 'fixed' },
      })
    expect(res.status).toBe(201)
  })
})

describe('PATCH /api/tasks/:id — recurrence validation', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  async function createTask(title: string, columnId: string) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title, columnId })
    return res.body
  }

  it('returns 400 when recurrence added but no doDate or dueDate', async () => {
    const task = await createTask('Task', BACKLOG_COLUMN_ID)
    expect(task.id).toBeDefined()

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ recurrence: { kind: 'daily', mode: 'fixed' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Recurring tasks must have at least a do date or due date.')
  })

  it('can clear recurrence by setting it to null', async () => {
    const task = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Task',
        columnId: BACKLOG_COLUMN_ID,
        doDate: '2026-04-05',
        recurrence: { kind: 'daily', mode: 'fixed' },
      })
    expect(task.status).toBe(201)

    const res = await request(app)
      .patch(`/api/tasks/${task.body.id}`)
      .send({ recurrence: null })
    expect(res.status).toBe(200)
    expect(res.body.recurrence).toBeUndefined()
  })
})

describe('PATCH /api/tasks/:id — clearing assignee and priority', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('can clear assignee by setting it to null', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID, assignee: 'SL' })
    expect(res.status).toBe(201)
    expect(res.body.assignee).toBe('SL')

    const patchRes = await request(app)
      .patch(`/api/tasks/${res.body.id}`)
      .send({ assignee: null })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.assignee).toBeUndefined()
  })

  it('can clear priority by setting it to null', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID, priority: 'high' })
    expect(res.status).toBe(201)
    expect(res.body.priority).toBe('high')

    const patchRes = await request(app)
      .patch(`/api/tasks/${res.body.id}`)
      .send({ priority: null })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.priority).toBeUndefined()
  })

  it('can set assignee from null to a value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(201)
    expect(res.body.assignee).toBeUndefined()

    const patchRes = await request(app)
      .patch(`/api/tasks/${res.body.id}`)
      .send({ assignee: 'KL' })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.assignee).toBe('KL')
  })

  it('can set priority from null to a value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(201)
    expect(res.body.priority).toBeUndefined()

    const patchRes = await request(app)
      .patch(`/api/tasks/${res.body.id}`)
      .send({ priority: 'medium' })
    expect(patchRes.status).toBe(200)
    expect(patchRes.body.priority).toBe('medium')
  })
})

describe('updateTask — recurring task completion', () => {
  beforeEach(() => {
    // Reset board to known state
    const board: Board = {
      columns: [
        { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
        { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
        { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
      ],
      tasks: [],
    }
    writeBoard(board)
  })

  async function createTask(title: string, columnId: string, extra?: Record<string, unknown>) {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title, columnId, ...extra })
    return res.body
  }

  it('sets completedAt when task moved to Done', async () => {
    const task = await createTask('Test', BACKLOG_COLUMN_ID)
    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()
  })

  it('generates next occurrence when recurring task moved to Done', async () => {
    // Use a future doDate so the next occurrence's date is also in the future
    // and won't be promoted to Today by reconcileTask
    const task = await createTask('Daily Task', BACKLOG_COLUMN_ID, {
      doDate: '2026-12-31',
      recurrence: { kind: 'daily', mode: 'fixed' },
    })
    expect(task.id).toBeDefined()

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()

    const boardRes = await request(app).get('/api/board')
    const nextTasks = boardRes.body.tasks.filter((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(1)
    expect(nextTasks[0].title).toBe('Daily Task')
    expect(nextTasks[0].doDate).toBe('2027-01-01')
    expect(nextTasks[0].columnId).toBe(BACKLOG_COLUMN_ID)
    expect(nextTasks[0].recurrenceRootId).toBe(task.id)
  })

  it('sets recurrenceRootId on first occurrence', async () => {
    const task = await createTask('Daily Task', BACKLOG_COLUMN_ID, {
      doDate: '2026-04-05',
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    const boardRes = await request(app).get('/api/board')
    const nextTask = boardRes.body.tasks.find((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTask?.recurrenceRootId).toBe(task.id)
  })

  it('is idempotent — does not create duplicate next occurrence', async () => {
    const task = await createTask('Daily Task', BACKLOG_COLUMN_ID, {
      doDate: '2026-04-05',
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    // Complete again — should be idempotent
    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    const boardRes = await request(app).get('/api/board')
    const nextTasks = boardRes.body.tasks.filter((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(1) // still only one
  })

  it('suppressNextOccurrence skips next occurrence creation', async () => {
    const task = await createTask('Daily Task', BACKLOG_COLUMN_ID, {
      doDate: '2026-04-05',
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID, suppressNextOccurrence: true })
    expect(res.status).toBe(200)
    expect(res.body.completedAt).toBeDefined()

    const boardRes = await request(app).get('/api/board')
    const nextTasks = boardRes.body.tasks.filter((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTasks).toHaveLength(0) // suppressed
  })

  it('next occurrence respects intervalDays', async () => {
    const task = await createTask('Every 3 days', BACKLOG_COLUMN_ID, {
      doDate: '2026-04-05',
      recurrence: { kind: 'interval_days', mode: 'fixed', intervalDays: 3 },
    })

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    const boardRes = await request(app).get('/api/board')
    const nextTask = boardRes.body.tasks.find((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTask?.doDate).toBe('2026-04-08')
  })

  it('next occurrence inherits priority and assignee', async () => {
    const task = await createTask('Important', BACKLOG_COLUMN_ID, {
      doDate: '2026-04-05',
      priority: 'high',
      assignee: 'SL',
      recurrence: { kind: 'daily', mode: 'fixed' },
    })

    await request(app)
      .patch(`/api/tasks/${task.id}`)
      .send({ columnId: DONE_COLUMN_ID })

    const boardRes = await request(app).get('/api/board')
    const nextTask = boardRes.body.tasks.find((t: { previousOccurrenceId?: string }) => t.previousOccurrenceId === task.id)
    expect(nextTask?.priority).toBe('high')
    expect(nextTask?.assignee).toBe('SL')
  })
})