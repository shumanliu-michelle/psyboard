import { describe, it, expect, beforeEach } from 'vitest'
import { reorderTasks, readBoard, writeBoard } from '../store/boardStore.js'
import { randomUUID } from 'crypto'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('reorderTasks', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  it('should throw if task not found', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    expect(() => reorderTasks('nonexistent-id', todayId, 0)).toThrow('Task not found')
  })

  it('should throw if target column not found', () => {
    const board = readBoard()
    const task = { id: randomUUID(), title: 'Test', columnId: board.columns[0].id, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)
    expect(() => reorderTasks(task.id, 'nonexistent-col', 0)).toThrow('Column not found')
  })

  it('should renumber column when inserting at start', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task3 = { id: randomUUID(), title: 'Task 3', columnId: todayId, order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2, task3)
    writeBoard(board)

    // Move task3 to position 0
    const affected = reorderTasks(task3.id, todayId, 0)

    const sorted = affected.sort((a, b) => a.order - b.order)
    expect(sorted.map(t => t.order)).toEqual([0, 1, 2])
    expect(sorted[0].id).toBe(task3.id)
  })

  it('should renumber source column on cross-column move', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const backlogId = board.columns.find(c => c.systemKey === 'backlog')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2)
    writeBoard(board)

    const affected = reorderTasks(task1.id, backlogId, 0)

    // Source column (today) should have only task2, renumbered to 0
    const sourceTasks = affected.filter(t => t.columnId === todayId)
    expect(sourceTasks.length).toBe(1)
    expect(sourceTasks[0].id).toBe(task2.id)
    expect(sourceTasks[0].order).toBe(0)

    // Target task should be in backlog
    const movedTask = affected.find(t => t.id === task1.id)
    expect(movedTask!.columnId).toBe(backlogId)
  })

  it('should set completedAt when moving to Done', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const doneId = board.columns.find(c => c.systemKey === 'done')!.id

    const task = { id: randomUUID(), title: 'Task', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const affected = reorderTasks(task.id, doneId, 0)
    const movedTask = affected.find(t => t.id === task.id)

    expect(movedTask!.columnId).toBe(doneId)
    expect(movedTask!.completedAt).toBeDefined()
  })

  it('should clear completedAt when moving out of Done', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const doneId = board.columns.find(c => c.systemKey === 'done')!.id

    const task = { id: randomUUID(), title: 'Task', columnId: doneId, order: 0, completedAt: new Date().toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const affected = reorderTasks(task.id, todayId, 0)
    const movedTask = affected.find(t => t.id === task.id)

    expect(movedTask!.columnId).toBe(todayId)
    expect(movedTask!.completedAt).toBeUndefined()
  })

  it('handles moving task to end of an empty column', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const doneId = board.columns.find(c => c.systemKey === 'done')!.id

    // Create a task in Today column
    const task = { id: randomUUID(), title: 'Task', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    // Move task to empty Done column (end of column is index 0 for empty column)
    const affected = reorderTasks(task.id, doneId, 0)
    const movedTask = affected.find(t => t.id === task.id)

    expect(movedTask!.columnId).toBe(doneId)
    expect(movedTask!.order).toBe(0)
    expect(movedTask!.completedAt).toBeDefined()
  })

  it('handles newIndex at end of target column', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    // Create three tasks in Today column
    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task3 = { id: randomUUID(), title: 'Task 3', columnId: todayId, order: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2, task3)
    writeBoard(board)

    // Move task1 to end of column (after task3)
    const affected = reorderTasks(task1.id, todayId, 3)

    const sorted = affected.sort((a, b) => a.order - b.order)
    expect(sorted.map(t => t.id)).toEqual([task2.id, task3.id, task1.id])
    expect(sorted[2].order).toBe(2)
  })

  it('is a no-op when moving to same column at same index', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    const task1 = { id: randomUUID(), title: 'Task 1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const task2 = { id: randomUUID(), title: 'Task 2', columnId: todayId, order: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task1, task2)
    writeBoard(board)

    // Move task1 to same position (same column, same index)
    const affected = reorderTasks(task1.id, todayId, 0)

    const sorted = affected.sort((a, b) => a.order - b.order)
    expect(sorted.map(t => t.id)).toEqual([task1.id, task2.id])
    expect(sorted[0].order).toBe(0)
    expect(sorted[1].order).toBe(1)
  })

  it('returns 404 for non-existent task', () => {
    expect(() => reorderTasks('nonexistent-id', 'col-backlog', 0)).toThrow('Task not found')
  })

  it('returns error for non-existent target column', () => {
    const board = readBoard()
    const task = { id: randomUUID(), title: 'Test', columnId: board.columns[0].id, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)
    expect(() => reorderTasks(task.id, 'nonexistent-col', 0)).toThrow('Column not found')
  })
})
