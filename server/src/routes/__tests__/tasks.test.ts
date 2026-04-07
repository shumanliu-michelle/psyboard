import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { writeBoard } from '../../store/boardStore.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { DONE_COLUMN_ID, BACKLOG_COLUMN_ID, TODAY_COLUMN_ID } from '../../types.js'
import type { Task } from '../../types.js'

describe('GET /api/tasks', () => {
  beforeEach(() => {
    setupTestBoard()
    writeBoard(createTestBoard())
  })
  afterEach(() => { teardownTestBoard() })

  it('returns 200 with tasks array', async () => {
    const res = await request(app).get('/api/tasks')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tasks')
    expect(res.body).toHaveProperty('hasMore')
    expect(Array.isArray(res.body.tasks)).toBe(true)
  })

  it('returns all tasks when no filters', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Today task', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(2)
  })

  it('filters by columnId=eq', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-backlog', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't-today', title: 'Today task', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-backlog')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-backlog')
    expect(ids).not.toContain('t-today')
  })

  it('filters by columnId=ne', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-backlog', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't-done', title: 'Done task', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=ne:col-done')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-backlog')
    expect(ids).not.toContain('t-done')
  })

  it('filters by title contains', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Buy groceries', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Clean bathroom', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?title=cont:groceries')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t1')
    expect(ids).not.toContain('t2')
  })

  it('filters by dueDate=eq', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tomorrow = '2026-04-08'
    const tasks: Task[] = [
      { id: 't-today', title: 'Due today', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: today },
      { id: 't-tomorrow', title: 'Due tomorrow', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: tomorrow },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?dueDate=eq:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-tomorrow')
  })

  it('filters by dueDate range (gte + lte)', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tasks: Task[] = [
      { id: 't-overdue', title: 'Overdue', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-05' },
      { id: 't-today', title: 'Due today', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: today },
      { id: 't-tomorrow', title: 'Due tomorrow', columnId: TODAY_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-08' },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?dueDate=gte:${today}&dueDate=lte:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-overdue')
    expect(ids).not.toContain('t-tomorrow')
  })

  it('filters by doDate', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tasks: Task[] = [
      { id: 't-past', title: 'Past do date', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), doDate: '2026-04-05' },
      { id: 't-today', title: 'Do today', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), doDate: today },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?doDate=gte:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-past')
  })

  it('filters done tasks by completedAt< for pagination', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-1d', title: 'Done 1 day ago', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-8d', title: 'Done 8 days ago', columnId: DONE_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-15d', title: 'Done 15 days ago', columnId: DONE_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const before10d = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const res = await request(app).get(`/api/tasks?columnId=eq:col-done&completedAt=lt:${encodeURIComponent(before10d)}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-15d')
    expect(ids).not.toContain('t-8d')
    expect(ids).not.toContain('t-1d')
  })

  it('filters by priority', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-high', title: 'High priority', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), priority: 'high' as const },
      { id: 't-low', title: 'Low priority', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), priority: 'low' as const },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?priority=eq:high')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-high')
    expect(ids).not.toContain('t-low')
  })

  it('filters by assignee', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-kl', title: 'KL task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), assignee: 'KL' as const },
      { id: 't-sl', title: 'SL task', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), assignee: 'SL' as const },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?assignee=eq:KL')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-kl')
    expect(ids).not.toContain('t-sl')
  })

  it('respects limit param', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Task 2', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't3', title: 'Task 3', columnId: BACKLOG_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBe(2)
  })

  it('sets hasMore true when results exceed limit', async () => {
    const now = new Date()
    const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`, title: `Task ${i}`, columnId: BACKLOG_COLUMN_ID, order: i,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    }))
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(true)
  })

  it('sets hasMore false when results fit within limit', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=5')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(false)
  })

  it('supports offset for pagination', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Task 2', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't3', title: 'Task 3', columnId: BACKLOG_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2&offset=2')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBe(1)
    expect(res.body.hasMore).toBe(false)
  })

  it('sorts by completedAt desc for Done column queries', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-old', title: 'Old', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-new', title: 'New', columnId: DONE_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-done')
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].id).toBe('t-new')
    expect(res.body.tasks[1].id).toBe('t-old')
  })

  it('sorts by dueDate asc for non-Done queries', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-tomorrow', title: 'Tomorrow', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-08' },
      { id: 't-today', title: 'Today', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-07' },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-today')
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].id).toBe('t-today')
    expect(res.body.tasks[1].id).toBe('t-tomorrow')
  })

  it('returns 400 for invalid query param format', async () => {
    // 'title=eq:value' — title only supports 'cont' operator
    const res = await request(app).get('/api/tasks?title=eq:value')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for invalid date value', async () => {
    const res = await request(app).get('/api/tasks?dueDate=eq:not-a-date')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns empty array when no tasks match', async () => {
    writeBoard(createTestBoard([]))
    const res = await request(app).get('/api/tasks?columnId=eq:col-done')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toEqual([])
    expect(res.body.hasMore).toBe(false)
  })
})
