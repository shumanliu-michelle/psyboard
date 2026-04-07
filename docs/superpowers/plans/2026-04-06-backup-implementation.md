# Backup Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a time-based backup system that creates timestamped backups of `board.json` every 2 hours, keeping only the most recent backup.

**Architecture:** A new `server/src/backup.ts` module with `startBackupScheduler()` and `createBackup()`, integrated into the server startup in `index.ts`. Backups live in the same `data/` directory.

**Tech Stack:** Node.js `fs`, `setInterval`, Vitest for testing.

---

## File Structure

| File | Change |
|------|--------|
| `server/src/backup.ts` | Create — backup scheduler module |
| `server/src/index.ts` | Modify — call `startBackupScheduler` on startup |
| `server/src/__tests__/backup.test.ts` | Create — unit tests |

---

## Task 1: Create `server/src/backup.ts`

**Files:**
- Create: `server/src/backup.ts`
- Test: `server/src/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import { setupTestBoard, teardownTestBoard, createTestBoard } from './testBoard.js'
import { writeBoard } from '../store/boardStore.js'
import { createBackup, startBackupScheduler, stopBackupScheduler } from '../backup.js'

setupTestBoard()

describe('Backup', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  afterEach(() => {
    stopBackupScheduler()
  })

  it('creates a backup file with correct timestamp format', async () => {
    await createBackup()

    const files = fs.readdirSync('/tmp/psyboard-test-{uuid}/data/')
    const backupFile = files.find(f => f.startsWith('board.') && f.endsWith('.json'))
    expect(backupFile).toBeDefined()

    // Format: board.YYYY-MM-DDTHH-mm-ss.json
    const timestamp = backupFile!.replace('board.', '').replace('.json', '')
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
  })

  it('keeps only the most recent backup after multiple runs', async () => {
    const dataDir = '/tmp/psyboard-test-{uuid}/data/'

    await createBackup()
    await new Promise(r => setTimeout(r, 1100)) // wait > 1 second
    await createBackup()
    await new Promise(r => setTimeout(r, 1100))
    await createBackup()

    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('board.') && f.endsWith('.json'))
    expect(files).toHaveLength(1)
  })

  it('handles missing board.json gracefully', async () => {
    const boardPath = '/tmp/psyboard-test-{uuid}/data/board.json'
    fs.rmSync(boardPath)

    // Should not throw
    await expect(createBackup()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest src/__tests__/backup.test.ts --run`
Expected: FAIL with "module not found" (backup.ts doesn't exist yet)

- [ ] **Step 3: Write the minimal implementation**

```typescript
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, '..', '..', 'data')

function getDataDir(): string {
  return DATA_DIR
}

function getBoardFile(): string {
  return path.join(getDataDir(), 'board.json')
}

let _backupTimer: ReturnType<typeof setInterval> | null = null

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function createBackup(): Promise<void> {
  const boardFile = getBoardFile()

  if (!fs.existsSync(boardFile)) {
    return
  }

  try {
    const timestamp = formatTimestamp(new Date())
    const backupFile = path.join(getDataDir(), `board.${timestamp}.json`)
    fs.copyFileSync(boardFile, backupFile)

    // Cleanup old backups — keep only the most recent
    const files = fs.readdirSync(getDataDir())
      .filter(f => f.startsWith('board.') && f.endsWith('.json') && f !== 'board.json')
      .map(f => ({
        name: f,
        mtime: fs.statSync(path.join(getDataDir(), f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)

    // Delete all but the first (most recent)
    for (const file of files.slice(1)) {
      try {
        fs.unlinkSync(path.join(getDataDir(), file.name))
      } catch {
        console.warn(`[backup] Failed to delete old backup: ${file.name}`)
      }
    }
  } catch (err) {
    console.warn('[backup] Backup failed:', err)
  }
}

export function startBackupScheduler(intervalMs: number): void {
  stopBackupScheduler()
  // Fire immediately, then on interval
  createBackup()
  _backupTimer = setInterval(() => {
    createBackup()
  }, intervalMs)
}

export function stopBackupScheduler(): void {
  if (_backupTimer !== null) {
    clearInterval(_backupTimer)
    _backupTimer = null
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest src/__tests__/backup.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/backup.ts server/src/__tests__/backup.test.ts
git commit -m "feat(backup): add timestamped backup scheduler"
```

---

## Task 2: Integrate into `server/src/index.ts`

**Files:**
- Modify: `server/src/index.ts:7` (add import)
- Modify: `server/src/index.ts:24-26` (add call)

- [ ] **Step 1: Add the import**

In `server/src/index.ts`, add after line 7:
```typescript
import { startBackupScheduler } from './backup.js'
```

- [ ] **Step 2: Add the call on server startup**

In the `app.listen` callback, after `startScheduler()`:
```typescript
startBackupScheduler(2 * 60 * 60 * 1000) // 2 hours
```

- [ ] **Step 3: Run full server test suite**

Run: `cd server && npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): start backup scheduler on server boot"
```

---

## Self-Review Checklist

- [ ] Spec coverage: timestamped backup files ✓, rotation (keep newest) ✓, interval scheduler ✓, error handling ✓
- [ ] No placeholders: all code is concrete, no TBD/TODO
- [ ] Type consistency: `createBackup()` returns `Promise<void>`, `startBackupScheduler(intervalMs: number)` matches spec
- [ ] All three test cases from spec covered: timestamp format ✓, rotation ✓, missing board.json ✓
