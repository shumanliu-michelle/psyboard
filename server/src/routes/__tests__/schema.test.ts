import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { writeBoard } from '../../store/boardStore.js'
import * as boardStore from '../../store/boardStore.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { vi } from 'vitest'

setupTestBoard()

describe('GET /api/schema', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  afterEach(() => {
    teardownTestBoard()
  })

  it('returns columns and task field definitions', async () => {
    const res = await request(app).get('/api/schema')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('columns')
    expect(res.body).toHaveProperty('taskFields')
    expect(res.body).toHaveProperty('endpoints')
  })

  it('includes system columns (Backlog, Today, Done)', async () => {
    const res = await request(app).get('/api/schema')
    const titles = res.body.columns.map((c: { title: string }) => c.title)
    expect(titles).toContain('Backlog')
    expect(titles).toContain('Today')
    expect(titles).toContain('Done')
  })

  it('includes all endpoint definitions', async () => {
    const res = await request(app).get('/api/schema')
    expect(res.body.endpoints).toHaveProperty('getBoard')
    expect(res.body.endpoints).toHaveProperty('getSchema')
    expect(res.body.endpoints).toHaveProperty('createColumn')
    expect(res.body.endpoints).toHaveProperty('deleteColumn')
    expect(res.body.endpoints).toHaveProperty('createTask')
    expect(res.body.endpoints).toHaveProperty('updateTask')
    expect(res.body.endpoints).toHaveProperty('deleteTask')
    expect(res.body.endpoints).toHaveProperty('reorderTasks')
  })

  it('returns column objects with id, title, kind, systemKey, position', async () => {
    const res = await request(app).get('/api/schema')
    const columns = res.body.columns
    expect(columns.length).toBeGreaterThan(0)
    for (const col of columns) {
      expect(col).toHaveProperty('id')
      expect(col).toHaveProperty('title')
      expect(col).toHaveProperty('kind')
      expect(col).toHaveProperty('position')
    }
  })

  it('returns taskFields with all key field definitions', async () => {
    const res = await request(app).get('/api/schema')
    const taskFields = res.body.taskFields
    expect(taskFields).toHaveProperty('columnId')
    expect(taskFields).toHaveProperty('title')
    expect(taskFields).toHaveProperty('description')
    expect(taskFields).toHaveProperty('doDate')
    expect(taskFields).toHaveProperty('dueDate')
    expect(taskFields).toHaveProperty('priority')
    expect(taskFields).toHaveProperty('assignee')
    expect(taskFields).toHaveProperty('recurrence')
    expect(taskFields).toHaveProperty('completedAt')
  })

  it('returns 500 when readBoard fails', async () => {
    vi.spyOn(boardStore, 'readBoard').mockImplementation(() => {
      throw new Error('read failed')
    })
    const res = await request(app).get('/api/schema')
    expect(res.status).toBe(500)
    expect(res.body).toHaveProperty('error')
    vi.restoreAllMocks()
  })
})