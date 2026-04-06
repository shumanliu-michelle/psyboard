import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { setBoardPath, resetBoardPath, writeBoard } from '../store/boardStore.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import type { Board } from '../types.js'

/**
 * Set up an isolated board for a test file.
 * Call this in a `before` hook at the top of each test file.
 * An `after` hook should call `teardownTestBoard()` to clean up.
 */
export function setupTestBoard(): string {
  const tmpDir = path.join('/tmp', `psyboard-test-${randomUUID()}`)
  fs.mkdirSync(tmpDir, { recursive: true })
  setBoardPath(path.join(tmpDir, 'board.json'))
  return tmpDir
}

export function teardownTestBoard(): void {
  resetBoardPath()
}

export const STANDARD_COLUMNS = [
  { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system' as const, systemKey: 'backlog' as const, position: 0, createdAt: '', updatedAt: '' },
  { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system' as const, systemKey: 'today' as const, position: 1, createdAt: '', updatedAt: '' },
  { id: DONE_COLUMN_ID, title: 'Done', kind: 'system' as const, systemKey: 'done' as const, position: 2, createdAt: '', updatedAt: '' },
]

export function createTestBoard(tasks: Board['tasks'] = []): Board {
  return {
    columns: [...STANDARD_COLUMNS],
    tasks,
  }
}
