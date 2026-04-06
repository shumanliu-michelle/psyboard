import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import path from 'path'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, teardownTestBoard } from './testBoard.js'
import { setDataDir, resetDataDir, createBackup, startBackupScheduler, stopBackupScheduler } from '../backup.js'

describe('Backup', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = setupTestBoard()
    setDataDir(tmpDir)
  })

  afterEach(() => {
    stopBackupScheduler()
    resetDataDir()
    teardownTestBoard()
  })

  it('creates a backup file with correct timestamp format', async () => {
    writeBoard({ columns: [], tasks: [] })

    await createBackup()

    const files = fs.readdirSync(tmpDir)
    const backupFiles = files.filter(f => f.startsWith('board.') && f.endsWith('.json') && f !== 'board.json')
    expect(backupFiles).toHaveLength(1)

    const timestampPattern = /^board\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/
    expect(backupFiles[0]).toMatch(timestampPattern)
  })

  it('keeps only the most recent backup after multiple runs', async () => {
    writeBoard({ columns: [], tasks: [] })

    await createBackup()
    await new Promise(r => setTimeout(r, 1100))
    await createBackup()
    await new Promise(r => setTimeout(r, 1100))
    await createBackup()

    const files = fs.readdirSync(tmpDir)
    const backupFiles = files.filter(f => f.startsWith('board.') && f.endsWith('.json') && f !== 'board.json')
    expect(backupFiles).toHaveLength(1)
  })

  it('handles missing board.json gracefully', async () => {
    // board.json does not exist — deleteBoard was not called, board just doesn't exist yet
    await expect(createBackup()).resolves.toBeUndefined()

    const files = fs.readdirSync(tmpDir)
    const backupFiles = files.filter(f => f.startsWith('board.') && f.endsWith('.json'))
    expect(backupFiles).toHaveLength(0)
  })
})
