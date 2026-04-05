import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { DONE_COLUMN_ID, TODAY_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import type { Board } from '../types.js'

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