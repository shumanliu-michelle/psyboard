import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'
import { DONE_COLUMN_ID, BACKLOG_COLUMN_ID, TODAY_COLUMN_ID } from '../types.js'
import type { Board, Task } from '../types.js'

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

  it('filters Done tasks to last 7 days', async () => {
    const now = new Date()
    const sixDaysAgo = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
    const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()

    const tasks: Task[] = [
      {
        id: 'task-recent-done',
        title: 'Recently completed',
        columnId: DONE_COLUMN_ID,
        order: 0,
        createdAt: eightDaysAgo,
        updatedAt: sixDaysAgo,
        completedAt: sixDaysAgo,
      },
      {
        id: 'task-old-done',
        title: 'Old completed',
        columnId: DONE_COLUMN_ID,
        order: 1,
        createdAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
        completedAt: eightDaysAgo,
      },
      {
        id: 'task-today',
        title: 'In Today',
        columnId: TODAY_COLUMN_ID,
        order: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
      {
        id: 'task-backlog',
        title: 'In Backlog',
        columnId: BACKLOG_COLUMN_ID,
        order: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    ]

    writeBoard(createTestBoard(tasks))

    const response = await request(app).get('/api/board')
    expect(response.status).toBe(200)

    const returnedTasks = response.body.tasks
    const taskIds = returnedTasks.map((t: Task) => t.id)

    // Recently completed (6 days ago) should be included
    expect(taskIds).toContain('task-recent-done')
    // Old completed (8 days ago) should be filtered out
    expect(taskIds).not.toContain('task-old-done')
    // Non-Done tasks should always be included
    expect(taskIds).toContain('task-today')
    expect(taskIds).toContain('task-backlog')
  })

  it('includes Done task without completedAt', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()

    const tasks: Task[] = [
      {
        id: 'task-done-no-completedAt',
        title: 'Done without completedAt',
        columnId: DONE_COLUMN_ID,
        order: 0,
        createdAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
        // completedAt is undefined
      },
    ]

    writeBoard(createTestBoard(tasks))

    const response = await request(app).get('/api/board')
    expect(response.status).toBe(200)

    const taskIds = response.body.tasks.map((t: Task) => t.id)
    // Task without completedAt should be included (conservative - no timestamp to filter by)
    expect(taskIds).toContain('task-done-no-completedAt')
  })

  it('does not filter non-Done columns regardless of age', async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()

    const tasks: Task[] = [
      {
        id: 'task-old-backlog',
        title: 'Old Backlog task',
        columnId: BACKLOG_COLUMN_ID,
        order: 0,
        createdAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
      },
    ]

    writeBoard(createTestBoard(tasks))

    const response = await request(app).get('/api/board')
    expect(response.status).toBe(200)

    const taskIds = response.body.tasks.map((t: Task) => t.id)
    expect(taskIds).toContain('task-old-backlog')
  })
})
