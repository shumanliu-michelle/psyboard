import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('POST /api/columns — creates custom column', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('creates a custom column with a generated ID', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: 'My Custom Column' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
    expect(res.body.title).toBe('My Custom Column')
    expect(res.body.kind).toBe('custom')
    expect(res.body.position).toBeDefined()
  })

  it('creates a custom column with an accent color', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: 'Pink Column', accent: '#ec4899' })
    expect(res.status).toBe(201)
    expect(res.body.accent).toBe('#ec4899')
  })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 for whitespace-only title', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it('returns 400 for reserved name', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: 'Backlog' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot create column with a reserved name')
  })
})

describe('DELETE /api/columns/:id — deletes column', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('deletes a custom column and moves its tasks to Backlog', async () => {
    // Create a custom column
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id
    expect(createRes.status).toBe(201)

    // Add a task to the custom column
    const taskRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task in custom', columnId: customId })
    expect(taskRes.status).toBe(201)
    const taskId = taskRes.body.id

    // Delete the custom column
    const deleteRes = await request(app).delete(`/api/columns/${customId}`)
    expect(deleteRes.status).toBe(204)

    // Verify task was moved to Backlog
    const boardRes = await request(app).get('/api/board')
    const task = boardRes.body.tasks.find((t: { id: string }) => t.id === taskId)
    expect(task.columnId).toBe(BACKLOG_COLUMN_ID)
  })

  it('returns 403 when deleting a system column', async () => {
    const res = await request(app).delete(`/api/columns/${BACKLOG_COLUMN_ID}`)
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Cannot delete system column')
  })

  it('returns 404 for non-existent column', async () => {
    const res = await request(app).delete('/api/columns/non-existent-id')
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Column not found')
  })
})

describe('PATCH /api/columns/:id — renames column', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('renames a custom column', async () => {
    // Create a custom column first
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Old Name' })
    const customId = createRes.body.id

    // Rename it
    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ title: 'New Name' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('New Name')
  })

  it('returns 400 for empty rename', async () => {
    // Create a custom column first
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id

    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ title: '' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Title must be a non-empty string')
  })

  it('returns 400 for whitespace-only rename', async () => {
    // Create a custom column first
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id

    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ title: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Title must be a non-empty string')
  })

  it('returns 400 for reserved name rename', async () => {
    // Create a custom column first
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id

    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ title: 'Backlog' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Cannot rename column to a reserved name')
  })

  it('returns 403 when renaming a system column', async () => {
    const res = await request(app)
      .patch(`/api/columns/${BACKLOG_COLUMN_ID}`)
      .send({ title: 'New Name' })
    expect(res.status).toBe(403)
    expect(res.body.error).toBe('Cannot update a system column')
  })
})

describe('PATCH /api/columns/:id — updates column position', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('updates position of a custom column', async () => {
    // Create a custom column
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id

    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ position: 5 })
    expect(res.status).toBe(200)
    expect(res.body.position).toBe(5)
  })

  it('returns 400 for negative position', async () => {
    // Create a custom column
    const createRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Custom Column' })
    const customId = createRes.body.id

    const res = await request(app)
      .patch(`/api/columns/${customId}`)
      .send({ position: -1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Position must be a non-negative number')
  })
})

describe('POST /api/columns/reorder — reorders columns', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('reorders columns successfully', async () => {
    const boardRes = await request(app).get('/api/board')
    const originalColumns = boardRes.body.columns
    const columnIds = originalColumns.map((c: { id: string }) => c.id)

    // Reverse the order
    const reversed = [...columnIds].reverse()

    const res = await request(app)
      .post('/api/columns/reorder')
      .send({ columnIds: reversed })
    expect(res.status).toBe(200)
    expect(res.body.columns).toBeDefined()
    expect(res.body.columns.length).toBe(originalColumns.length)
  })

  it('returns 400 for invalid column IDs', async () => {
    const res = await request(app)
      .post('/api/columns/reorder')
      .send({ columnIds: ['invalid-id-1', 'invalid-id-2'] })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('One or more column IDs are invalid')
  })

  it('returns 400 for empty columnIds array', async () => {
    const res = await request(app)
      .post('/api/columns/reorder')
      .send({ columnIds: [] })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('columnIds must be a non-empty array')
  })
})
