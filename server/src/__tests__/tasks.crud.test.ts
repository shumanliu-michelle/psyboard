import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { BACKLOG_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('POST /api/tasks — validation', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 for whitespace-only title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '   ', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 for missing columnId', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test task' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('columnId is required')
  })

  it('returns 400 for non-existent columnId', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test task', columnId: 'col-does-not-exist' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Column not found')
  })

  it('returns 400 for invalid priority value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test task', columnId: BACKLOG_COLUMN_ID, priority: 'invalid' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('priority must be low, medium, or high')
  })

  it('returns 400 for invalid assignee value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Test task', columnId: BACKLOG_COLUMN_ID, assignee: 'invalid' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('assignee must be SL, KL, or null')
  })

  it('returns 201 with all valid fields', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Test task',
        columnId: BACKLOG_COLUMN_ID,
        description: 'A description',
        doDate: '2026-12-31',
        dueDate: '2027-01-05',
        priority: 'high',
        assignee: 'SL',
      })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Test task')
    expect(res.body.description).toBe('A description')
    expect(res.body.doDate).toBe('2026-12-31')
    expect(res.body.dueDate).toBe('2027-01-05')
    expect(res.body.priority).toBe('high')
    expect(res.body.assignee).toBe('SL')
    expect(res.body.columnId).toBe(BACKLOG_COLUMN_ID)
  })
})

describe('DELETE /api/tasks/:id', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('returns 204 for successful delete', async () => {
    const createRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task to delete', columnId: BACKLOG_COLUMN_ID })
    expect(createRes.status).toBe(201)
    const taskId = createRes.body.id

    const deleteRes = await request(app).delete(`/api/tasks/${taskId}`)
    expect(deleteRes.status).toBe(204)
  })

  it('returns 404 for non-existent task', async () => {
    const res = await request(app).delete('/api/tasks/12345678901')
    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 for invalid task ID format (less than 10 chars)', async () => {
    const res = await request(app).delete('/api/tasks/abc')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid task ID')
  })
})
