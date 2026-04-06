import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('GET /api/board', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('returns full board with columns and tasks', async () => {
    const response = await request(app).get('/api/board')

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('columns')
    expect(response.body).toHaveProperty('tasks')
    expect(Array.isArray(response.body.columns)).toBe(true)
    expect(Array.isArray(response.body.tasks)).toBe(true)
  })

  it('returns system columns with correct systemKeys', async () => {
    const response = await request(app).get('/api/board')

    expect(response.status).toBe(200)

    const columns = response.body.columns

    const backlogCol = columns.find((col: any) => col.systemKey === 'backlog')
    const todayCol = columns.find((col: any) => col.systemKey === 'today')
    const doneCol = columns.find((col: any) => col.systemKey === 'done')

    expect(backlogCol).toBeDefined()
    expect(todayCol).toBeDefined()
    expect(doneCol).toBeDefined()

    expect(backlogCol.title).toBe('Backlog')
    expect(todayCol.title).toBe('Today')
    expect(doneCol.title).toBe('Done')
  })
})
