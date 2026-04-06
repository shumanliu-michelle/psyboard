# Backup Scheduler Design

## Overview

Add a time-based backup system to protect `board.json` from data corruption. The backup scheduler runs as a background process on the server, creating timestamped backups at a configurable interval.

## Behavior

- On server startup, start a timer for the configured interval (default: 2 hours)
- When the timer fires, create a timestamped copy of `board.json` in the `data/` directory
- Filename format: `board.{YYYY-MM-DDTHH-mm-ss}.json` (e.g., `board.2026-04-06T14-00-00.json`)
- After each successful backup, delete all older backup files — only the most recent one is kept
- If the backup copy fails (disk full, permissions, etc.), log a warning and continue server operation

## New Module

### `server/src/backup.ts`

```typescript
// Starts the backup scheduler with the given interval in milliseconds
export function startBackupScheduler(intervalMs: number): void

// Manually triggers a backup (for testing or future use)
export function createBackup(): Promise<void>
```

## Backup Logic

```
1. Read current board.json
2. Generate timestamp: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
3. Build backup filename: board.{timestamp}.json
4. Write copy to data/ directory
5. List all board.*.json files
6. Sort by modification time (newest first)
7. Delete all except the first (most recent)
```

## Integration

In `server/src/index.ts`, call `startBackupScheduler` after the server starts:

```typescript
import { startBackupScheduler } from './backup.js'
import { startScheduler } from './home-assistant/scheduler.js'

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`psyboard server running on http://localhost:${PORT}`)
    startScheduler()
    startBackupScheduler(2 * 60 * 60 * 1000) // 2 hours
  })
}
```

## Files

| File | Change |
|------|--------|
| `server/src/backup.ts` | New — backup scheduler module |
| `server/src/index.ts` | Call `startBackupScheduler` on startup |

## Error Handling

- If `board.json` does not exist when backing up, skip the backup silently (the server will create a new one on next write if needed)
- If backup write fails, log a console warning and continue
- If deleting old backups fails, log a console warning and continue

## Testing

- `server/src/__tests__/backup.test.ts` — unit tests for backup logic:
  - `createBackup()` creates a file with correct timestamp format
  - `createBackup()` deletes older backups, keeps only newest
  - `createBackup()` handles missing `board.json` gracefully
