import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { DONE_COLUMN_ID, TODAY_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import type { Board } from '../types.js'
import { computeNextDate } from '../store/recurrence.js'
import type { RecurrenceConfig } from '../types.js'

describe('PATCH /api/tasks/:id — completedAt behavior', () => {
  beforeEach(() => {
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