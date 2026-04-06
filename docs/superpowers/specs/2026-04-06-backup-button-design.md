# Backup Button Design

## Overview

Add a manual backup button to the header toolbar, allowing users to trigger a backup on-demand. Follows the existing Home Assistant sync button pattern (loading/success/error states).

## API

### `POST /api/backup`

Triggers a manual backup immediately.

**Response:**
- `200 OK` — `{ "backup": "created" }`
- `500 Internal Server Error` — `{ "error": string }` if backup failed

## Backend

**New file:** `server/src/routes/backup.ts`

```typescript
import { Router } from 'express'
import { createBackup } from '../backup.js'

const router = Router()

router.post('/', async (_req, res) => {
  try {
    await createBackup()
    res.json({ backup: 'created' })
  } catch (err) {
    res.status(500).json({ error: 'Backup failed' })
  }
})

export default router
```

**Modify:** `server/src/index.ts` — add `app.use('/api/backup', backupRouter)` alongside other routes

## Frontend

**Modify:** `client/src/components/HeaderToolbar.tsx`

Add to `HeaderToolbarProps`:
```typescript
onBackup?: () => Promise<void>
```

Add state:
```typescript
const [backupStatus, setBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
```

Add handler:
```typescript
async function handleBackup() {
  if (!onBackup || backupStatus === 'loading') return
  setBackupStatus('loading')
  try {
    await onBackup()
    setBackupStatus('success')
    setTimeout(() => setBackupStatus('idle'), 3000)
  } catch {
    setBackupStatus('error')
    setTimeout(() => setBackupStatus('idle'), 4000)
  }
}
```

Add button (after HA sync button, before SseDot):
```tsx
{onBackup && (
  <button
    className={`toolbar-btn backup-btn ${backupStatus}`}
    onClick={handleBackup}
    aria-label="Backup board"
    title={backupStatus === 'loading' ? 'Backing up...' : backupStatus === 'success' ? 'Backup done!' : backupStatus === 'error' ? 'Backup failed' : 'Backup now'}
    disabled={backupStatus === 'loading'}
  >
    {backupStatus === 'loading' ? '⏳' : backupStatus === 'success' ? '✅' : backupStatus === 'error' ? '⚠️' : '💾'}
  </button>
)}
```

**Modify:** Parent component (App.tsx or BoardApp.tsx) — pass `onBackup` handler:
```typescript
async function handleBackup() {
  await fetch('/api/backup', { method: 'POST' })
}
```

## Files

| File | Change |
|------|--------|
| `server/src/routes/backup.ts` | New — backup API route |
| `server/src/index.ts` | Add backup router |
| `client/src/components/HeaderToolbar.tsx` | Add backup button |
| Parent component (App/BoardApp) | Pass `onBackup` handler |

## Testing

- `server/src/__tests__/backup.test.ts` — add route handler test for `POST /api/backup`
