import { describe, it, expect, beforeEach } from 'vitest'
import type { Board, Task } from '../types.js'
import { reconcileBoard } from '../store/reconciliation.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'

const today = '2026-04-05'

function makeBoard(tasks: Partial<Task>[]): Board {
  return {
    columns: [
      { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
      { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
      { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
    ],
    tasks: tasks.map((t, i) => ({
      id: t.id ?? `task-${i}`,
      title: t.title ?? 'Test task',
      columnId: t.columnId ?? BACKLOG_COLUMN_ID,
      order: i,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...t,
    })),
  }
}

describe('reconcileBoard', () => {
  it('does not promote task with doDate in the future', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('promotes task with doDate <= today from Backlog', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-05', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('promotes task with doDate < today from Backlog', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('promotes task with dueDate <= today when doDate is absent', () => {
    const board = makeBoard([{ id: 't1', dueDate: '2026-04-05', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })

  it('does not promote task with dueDate > today and no doDate', () => {
    const board = makeBoard([{ id: 't1', dueDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task already in Today', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: TODAY_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task already in Done', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', columnId: DONE_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('skips task with no dates in Backlog', () => {
    const board = makeBoard([{ id: 't1', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toBeNull()
  })

  it('prefers doDate over dueDate when both are present and doDate is eligible', () => {
    const board = makeBoard([{ id: 't1', doDate: '2026-04-01', dueDate: '2026-04-10', columnId: BACKLOG_COLUMN_ID }])
    const result = reconcileBoard(board, today)
    expect(result).toEqual({ ...board.tasks[0], columnId: TODAY_COLUMN_ID })
  })
})