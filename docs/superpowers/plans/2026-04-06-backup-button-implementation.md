# Backup Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual backup button to the header toolbar that triggers `POST /api/backup` and shows loading/success/error feedback.

**Architecture:** New `server/src/routes/backup.ts` route, `backup()` method added to `client/src/api.ts`, backup button wired into `HeaderToolbar` with same state pattern as HA sync button.

**Tech Stack:** Express router (server), React state (client)

---

## File Structure

| File | Change |
|------|--------|
| `server/src/routes/backup.ts` | Create — POST /api/backup route |
| `server/src/index.ts` | Add backup router |
| `client/src/api.ts` | Add `backup()` method |
| `client/src/components/HeaderToolbar.tsx` | Add backup button + state |
| `client/src/App.tsx` | Pass `onBackup` handler to HeaderToolbar |
| `server/src/__tests__/backup.test.ts` | Add route test |

---

## Task 1: Create `server/src/routes/backup.ts`

**Files:**
- Create: `server/src/routes/backup.ts`
- Test: `server/src/__tests__/backup.test.ts`

- [ ] **Step 1: Write the failing route test**

In `server/src/__tests__/backup.test.ts`, add after existing tests:

```typescript
import request from 'supertest'
import { app } from '../index.js'
import fs from 'fs'
import path from 'path'
import { setupTestBoard, teardownTestBoard, createTestBoard } from './testBoard.js'
import { writeBoard } from '../store/boardStore.js'
import { setDataDir, resetDataDir } from '../backup.js'

setupTestBoard()

describe('POST /api/backup', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  afterEach(() => {
    resetDataDir()
  })

  it('returns 200 and { backup: "created" } on success', async () => {
    const res = await request(app)
      .post('/api/backup')
      .expect(200)
    expect(res.body).toEqual({ backup: 'created' })
  })

  it('creates a backup file', async () => {
    await request(app).post('/api/backup').expect(200)
    const files = fs.readdirSync('/tmp/psyboard-test-{uuid}/data/')
      .filter(f => f.startsWith('board.') && f.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
  })
})
```

**Note:** The `{uuid}` in the path needs to match what `setupTestBoard` generates. Check the actual path by reading the `tmpDir` returned from `setupTestBoard()` — pass it to `setDataDir()` in the test.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest src/__tests__/backup.test.ts --run`
Expected: FAIL (route doesn't exist yet)

- [ ] **Step 3: Write the route implementation**

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest src/__tests__/backup.test.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/backup.ts
git commit -m "feat(backup): add POST /api/backup route"
```

---

## Task 2: Wire up route in `server/src/index.ts`

**Files:**
- Modify: `server/src/index.ts:3` (add import), line ~9 (add router)

- [ ] **Step 1: Add the import**

After line 3 (import homeAssistantRouter):
```typescript
import backupRouter from './routes/backup.js'
```

- [ ] **Step 2: Add the router**

After line 19 (app.use('/api/home-assistant', homeAssistantRouter)):
```typescript
app.use('/api/backup', backupRouter)
```

- [ ] **Step 3: Run tests to verify**

Run: `cd server && npm test`
Expected: All tests pass (including new backup route tests)

- [ ] **Step 4: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(server): add /api/backup route"
```

---

## Task 3: Add `backup()` to `client/src/api.ts`

**Files:**
- Modify: `client/src/api.ts:70` (add after syncHA)

- [ ] **Step 1: Add the API method**

After line 71 (`syncHA`):
```typescript
backup: () =>
  request<{ backup: string }>('/backup', { method: 'POST' }),
```

- [ ] **Step 2: Commit**

```bash
git add client/src/api.ts
git commit -m "feat(api): add backup() method"
```

---

## Task 4: Add backup button to `HeaderToolbar.tsx`

**Files:**
- Modify: `client/src/components/HeaderToolbar.tsx`

- [ ] **Step 1: Add props and state**

In `HeaderToolbarProps` (line 7), add:
```typescript
onBackup?: () => Promise<void>
```

Add state after line 19:
```typescript
const [backupStatus, setBackupStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
```

- [ ] **Step 2: Add handler**

After `handleHASync` (line 32):
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

- [ ] **Step 3: Add backup button**

After the HA sync button (lines 110-119), before `<SseDot status={sseStatus} />` (line 120):
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

- [ ] **Step 4: Pass handler from App.tsx**

In `client/src/App.tsx`, add handler after `handleHASync` (line 35):
```typescript
async function handleBackup() {
  await api.backup()
}
```

Pass to HeaderToolbar at line 95:
```tsx
<HeaderToolbar sseStatus={sseStatus} onHASync={handleHASync} onBackup={handleBackup} />
```

- [ ] **Step 5: Run client tests**

Run: `cd client && npm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add client/src/components/HeaderToolbar.tsx client/src/App.tsx client/src/api.ts
git commit -m "feat(ui): add backup button to header toolbar"
```

---

## Self-Review Checklist

- [ ] Spec coverage: POST /api/backup ✓, route in index.ts ✓, api.backup() ✓, backup button ✓, loading/success/error states ✓
- [ ] No placeholders: all code is concrete
- [ ] Type consistency: `backupStatus` type matches HA sync pattern, `api.backup()` returns correct type
- [ ] All 3 backend tasks (route, index, api method) and 1 frontend task (toolbar + App wiring)
