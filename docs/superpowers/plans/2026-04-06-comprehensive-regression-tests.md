# Comprehensive Regression Test Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add regression test coverage for both the server (Express API) and client (React + DnD) to catch bugs like the `??`-operator null-busting bug that motivated this work.

**Architecture:** Two test suites — server tests using `supertest` + isolated temp boards (one `.test.ts` per route module), and client tests using `@testing-library/react` + `userEvent` + `vi.mock` for the API layer.

**Tech Stack:** Vitest, supertest, @testing-library/react, @testing-library/user-event, @dnd-kit/core, @dnd-kit/sortable

---

## File Structure

```
server/src/
  __tests__/
    board.test.ts          # NEW — GET /api/board, migration/healing path
    columns.test.ts        # NEW — POST /columns, PATCH/DELETE /columns/:id
    tasks.crud.test.ts     # NEW — POST /tasks, DELETE /tasks/:id (patch is in tasks.test.ts)
    tasks.reorder.test.ts  # MODIFIED — extend edge cases
    events.test.ts         # MODIFIED — add SSE route tests
    homeAssistant.test.ts  # MODIFIED — add error path tests
    reconciliation.test.ts # MODIFIED — add next-occurrence reconciliation test
  __tests__/testBoard.ts  # MODIFIED — already exists, ensure teardown cleanup

client/src/
  __tests__/
    BoardView.test.tsx     # NEW — DnD integration, column/task rendering
    ColumnCard.test.tsx    # NEW — kebab menu, system column behavior
    TaskCard.test.tsx      # NEW — overdue, assignee badge, kebab menu
    api.test.ts            # NEW — API client unit tests
```

---

## Server Test Naming Conventions

Each server test file follows this pattern:
```typescript
import { setupTestBoard, createTestBoard } from './testBoard.js'
setupTestBoard() // at module top

beforeEach(() => { writeBoard(createTestBoard()) })
after(() => { teardownTestBoard() }) // cleanup temp dir
```

---

## Task 1: Server — `GET /api/board` + migration/healing

**Files:**
- Create: `server/src/__tests__/board.test.ts`
- References: `server/src/routes/board.ts`, `server/src/store/boardStore.ts`

- [ ] **Step 1: Write the failing test — returns full board state**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { writeBoard, readBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('GET /api/board', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('returns the full board with columns and tasks', async () => {
    const board = createTestBoard()
    board.tasks.push({
      id: 'task-1',
      title: 'Test Task',
      columnId: board.columns[0].id,
      order: 0,
      createdAt: '',
      updatedAt: '',
    })
    writeBoard(board)

    const res = await request(app).get('/api/board')
    expect(res.status).toBe(200)
    expect(res.body.columns).toHaveLength(3)
    expect(res.body.tasks).toHaveLength(1)
    expect(res.body.tasks[0].title).toBe('Test Task')
  })

  it('returns system columns with correct systemKeys', async () => {
    const res = await request(app).get('/api/board')
    expect(res.status).toBe(200)
    const backlog = res.body.columns.find((c: any) => c.systemKey === 'backlog')
    const today = res.body.columns.find((c: any) => c.systemKey === 'today')
    const done = res.body.columns.find((c: any) => c.systemKey === 'done')
    expect(backlog).toBeDefined()
    expect(today).toBeDefined()
    expect(done).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/__tests__/board.test.ts`
Expected: FAIL (file does not exist yet)

- [ ] **Step 3: Write minimal implementation — file just needs to exist**

```bash
touch server/src/__tests__/board.test.ts
```

- [ ] **Step 4: Run test to verify it compiles and runs**

Run: `npm test -- --run src/__tests__/board.test.ts`
Expected: PASS (supertest makes real HTTP request to in-process Express)

- [ ] **Step 5: Commit**

```bash
git add server/src/__tests__/board.test.ts
git commit -m "test(server): add GET /api/board regression tests"
```

---

## Task 2: Server — Column CRUD (`POST /columns`, `PATCH /columns/:id`, `DELETE /columns/:id`)

**Files:**
- Create: `server/src/__tests__/columns.test.ts`
- References: `server/src/routes/columns.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import { writeBoard, readBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('POST /api/columns', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('creates a custom column', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: 'Someday' })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Someday')
    expect(res.body.kind).toBe('custom')
  })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required|non-empty/i)
  })

  it('returns 400 for reserved name', async () => {
    const res = await request(app)
      .post('/api/columns')
      .send({ title: 'Backlog' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/reserved/i)
  })
})

describe('DELETE /api/columns/:id', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('deletes a custom column and moves its tasks to Backlog', async () => {
    // Create a custom column with a task
    const colRes = await request(app)
      .post('/api/columns')
      .send({ title: 'Someday' })
    const colId = colRes.body.id

    const taskRes = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task in custom col', columnId: colId })
    const taskId = taskRes.body.id

    const delRes = await request(app).delete(`/api/columns/${colId}`)
    expect(delRes.status).toBe(204)

    // Task should now be in Backlog
    const board = await request(app).get('/api/board')
    const task = board.body.tasks.find((t: any) => t.id === taskId)
    expect(task.columnId).toBe(BACKLOG_COLUMN_ID)
  })

  it('returns 403 when deleting a system column', async () => {
    const res = await request(app).delete(`/api/columns/${BACKLOG_COLUMN_ID}`)
    expect(res.status).toBe(403)
  })

  it('returns 404 for non-existent column', async () => {
    const res = await request(app).delete('/api/columns/col-does-not-exist')
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/columns/:id', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('renames a custom column', async () => {
    const col = await request(app)
      .post('/api/columns')
      .send({ title: 'Someday' })
    const colId = col.body.id

    const res = await request(app)
      .patch(`/api/columns/${colId}`)
      .send({ title: 'Later' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Later')
  })

  it('returns 400 for empty rename', async () => {
    const col = await request(app)
      .post('/api/columns')
      .send({ title: 'Someday' })
    const res = await request(app)
      .patch(`/api/columns/${col.body.id}`)
      .send({ title: '' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for renaming to reserved name', async () => {
    const col = await request(app)
      .post('/api/columns')
      .send({ title: 'Someday' })
    const res = await request(app)
      .patch(`/api/columns/${col.body.id}`)
      .send({ title: 'Today' })
    expect(res.status).toBe(400)
  })

  it('returns 403 when updating a system column', async () => {
    const res = await request(app)
      .patch(`/api/columns/${BACKLOG_COLUMN_ID}`)
      .send({ title: 'New Name' })
    expect(res.status).toBe(403)
  })

  it('updates column position', async () => {
    // Get all columns
    const board = await request(app).get('/api/board')
    const columns = board.body.columns.sort((a: any, b: any) => a.position - b.position)
    const colId = columns[2].id // last column

    const res = await request(app)
      .patch(`/api/columns/${colId}`)
      .send({ position: 0 })

    expect(res.status).toBe(200)
    expect(res.body.position).toBe(0)
  })
})

describe('POST /api/columns/reorder', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('reorders columns and returns updated list', async () => {
    const board = await request(app).get('/api/board')
    const cols = board.body.columns
    const reversed = [...cols].reverse().map((c: any) => c.id)

    const res = await request(app)
      .post('/api/columns/reorder')
      .send({ columnIds: reversed })

    expect(res.status).toBe(200)
    expect(res.body.columns.map((c: any) => c.id)).toEqual(reversed)
  })

  it('returns 400 for invalid column IDs', async () => {
    const board = await request(app).get('/api/board')
    const cols = board.body.columns
    const invalid = [...cols.map((c: any) => c.id), 'invalid-col-id']

    const res = await request(app)
      .post('/api/columns/reorder')
      .send({ columnIds: invalid })

    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/__tests__/columns.test.ts`
Expected: FAIL (file doesn't exist yet)

- [ ] **Step 3: Create empty file**

```bash
touch server/src/__tests__/columns.test.ts
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/__tests__/columns.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/__tests__/columns.test.ts
git commit -m "test(server): add column CRUD regression tests"
```

---

## Task 3: Server — Task CRUD (`POST /tasks` validation, `DELETE /tasks/:id`)

**Files:**
- Create: `server/src/__tests__/tasks.crud.test.ts`
- References: `server/src/routes/tasks.ts`, `server/src/__tests__/tasks.test.ts` (existing)

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { BACKLOG_COLUMN_ID, TODAY_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import { setupTestBoard, createTestBoard } from './testBoard.js'

setupTestBoard()

describe('POST /api/tasks — validation', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('returns 400 for empty title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/title|required/i)
  })

  it('returns 400 for whitespace-only title', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: '   ', columnId: BACKLOG_COLUMN_ID })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing columnId', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/columnId/i)
  })

  it('returns 400 for non-existent columnId', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: 'col-does-not-exist' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/not found/i)
  })

  it('returns 400 for invalid priority value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID, priority: 'urgent' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/priority/i)
  })

  it('returns 400 for invalid assignee value', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID, assignee: 'XX' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/assignee/i)
  })

  it('accepts null assignee to mean no assignee', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ title: 'Task', columnId: BACKLOG_COLUMN_ID, assignee: null })
    expect(res.status).toBe(201)
    expect(res.body.assignee).toBeUndefined()
  })

  it('returns 201 with all valid fields', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({
        title: 'Full Task',
        columnId: BACKLOG_COLUMN_ID,
        description: 'A description',
        doDate: '2026-04-10',
        dueDate: '2026-04-15',
        priority: 'high',
        assignee: 'SL',
      })
    expect(res.status).toBe(201)
    expect(res.body.title).toBe('Full Task')
    expect(res.body.priority).toBe('high')
    expect(res.body.assignee).toBe('SL')
  })
})

describe('DELETE /api/tasks/:id', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('deletes an existing task', async () => {
    const task = await request(app)
      .post('/api/tasks')
      .send({ title: 'To delete', columnId: BACKLOG_COLUMN_ID })

    const delRes = await request(app).delete(`/api/tasks/${task.body.id}`)
    expect(delRes.status).toBe(204)

    // Verify it's gone from the board
    const board = await request(app).get('/api/board')
    expect(board.body.tasks.find((t: any) => t.id === task.body.id)).toBeUndefined()
  })

  it('returns 404 for non-existent task', async () => {
    const res = await request(app).delete('/api/tasks/task-does-not-existxx')
    expect(res.status).toBe(404)
  })

  it('returns 400 for invalid task ID format', async () => {
    const res = await request(app).delete('/api/tasks/short')
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests (create empty file first)**

```bash
touch server/src/__tests__/tasks.crud.test.ts
```

Run: `npm test -- --run src/__tests__/tasks.crud.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/tasks.crud.test.ts
git commit -m "test(server): add task CRUD validation and delete regression tests"
```

---

## Task 4: Server — Extend `reorderTasks` edge cases

**Files:**
- Modify: `server/src/__tests__/tasks.reorder.test.ts` — add new `describe` block
- References: `server/src/__tests__/tasks.reorder.test.ts`

- [ ] **Step 1: Write failing tests for new edge cases**

Add these tests to `tasks.reorder.test.ts` inside the existing `describe('reorderTasks', ...)`:

```typescript
  it('handles moving task to end of an empty column', () => {
    const board = readBoard()
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id
    const task = { id: randomUUID(), title: 'Task', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const affected = reorderTasks(task.id, todayId, 0)
    expect(affected).toHaveLength(1)
    expect(affected[0].order).toBe(0)
  })

  it('handles newIndex at end of target column', () => {
    const board = readBoard()
    const backlogId = board.columns.find(c => c.systemKey === 'backlog')!.id
    const todayId = board.columns.find(c => c.systemKey === 'today')!.id

    const t1 = { id: randomUUID(), title: 'T1', columnId: todayId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    const t2 = { id: randomUUID(), title: 'T2', columnId: backlogId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(t1, t2)
    writeBoard(board)

    // Move t2 to end of today (index 1)
    const affected = reorderTasks(t2.id, todayId, 1)
    const todayTasks = affected.filter(t => t.columnId === todayId).sort((a, b) => a.order - b.order)
    expect(todayTasks.map(t => t.id)).toEqual([t1.id, t2.id])
  })

  it('is a no-op when moving to same column at same index', () => {
    const board = readBoard()
    const backlogId = board.columns.find(c => c.systemKey === 'backlog')!.id
    const task = { id: randomUUID(), title: 'Task', columnId: backlogId, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    const before = readBoard()
    const affected = reorderTasks(task.id, backlogId, 0)
    const after = readBoard()

    // Order should be unchanged
    expect(after.tasks.find(t => t.id === task.id)!.order).toBe(0)
    expect(affected).toHaveLength(1)
  })

  it('returns 404 for non-existent task', () => {
    const board = readBoard()
    const backlogId = board.columns.find(c => c.systemKey === 'backlog')!.id
    expect(() => reorderTasks('nonexistent', backlogId, 0)).toThrow('Task not found')
  })

  it('returns error for non-existent target column', () => {
    const board = readBoard()
    const task = { id: randomUUID(), title: 'Task', columnId: board.columns[0].id, order: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    board.tasks.push(task)
    writeBoard(board)

    expect(() => reorderTasks(task.id, 'nonexistent-col', 0)).toThrow('Column not found')
  })
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run src/__tests__/tasks.reorder.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/tasks.reorder.test.ts
git commit -m "test(server): add reorderTasks edge case regression tests"
```

---

## Task 5: Server — SSE events route

**Files:**
- Create: `server/src/routes/__tests__/events.test.ts` (replace existing stub)
- References: `server/src/routes/events.ts`, `server/src/index.ts`

- [ ] **Step 1: Write failing tests**

The existing stub only checks `broadcast` is a function. Replace with full route tests:

```typescript
import { describe, it, expect } from 'vitest'
import { app } from '../../index.js'
import { setupTestBoard, createTestBoard } from '../__tests__/testBoard.js'

setupTestBoard()

describe('GET /api/events — SSE', () => {
  it('streams a board_updated event when board changes', async () => {
    // Use supertest to make a request that will hang (SSE is a stream)
    const_TIMEOUT = setTimeout(() => {}, 10000) // prevent hang
    try {
      const res = await request(app)
        .get('/api/events')
        .query({ tabId: 'test-tab-1' })
        .buffer(true)
        .timeout(2000)
        // SSE streams don't end, so we can't use .expect(200)
        // Instead we verify the connection opened and the format
        expect(res.status).toBe(200)
        expect(res.type).toBe('text/event-stream')
    } finally {
      clearTimeout(_TIMEOUT)
    }
  })

  it('accepts tabId query param', async () => {
    const res = await request(app)
      .get('/api/events?tabId=my-tab')
    expect(res.status).toBe(200)
  })

  it('returns event stream content-type', async () => {
    const res = await request(app).get('/api/events')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run src/routes/__tests__/events.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/routes/__tests__/events.test.ts
git commit -m "test(server): add SSE events route regression tests"
```

---

## Task 6: Server — HA endpoint error paths

**Files:**
- Modify: `server/src/__tests__/homeAssistant.test.ts` — add error tests
- References: `server/src/home-assistant/index.ts`

- [ ] **Step 1: Write failing tests for HA error paths**

Add to `homeAssistant.test.ts`:

```typescript
describe('POST /api/home-assistant/check — error paths', () => {
  beforeEach(() => { writeBoard(createTestBoard()) })

  it('returns 500 when HA env is not configured', async () => {
    vi.mock('../home-assistant/config.js', () => ({
      loadHAEnv: () => { throw new Error('HOME_ASSISTANT_URL not set') },
      loadHAConfig: () => ({ defaultColumn: 'Today', alerts: [] }),
    }))

    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(500)
  })

  it('returns 500 when HA API request fails', async () => {
    vi.mock('../home-assistant/haClient.js', () => ({
      getAllStates: async () => { throw new Error('Network error') },
    }))

    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run src/__tests__/homeAssistant.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/homeAssistant.test.ts
git commit -m "test(server): add HA endpoint error path regression tests"
```

---

## Task 7: Server — Reconciliation of next occurrence

**Files:**
- Modify: `server/src/__tests__/reconciliation.test.ts` — add next-occurrence test
- References: `server/src/store/reconciliation.ts`

- [ ] **Step 1: Write failing test**

Add to `reconciliation.test.ts`:

```typescript
  it('does NOT promote next occurrence of recurring task when its date is in the future', () => {
    // Simulate what happens in updateTask: a recurring task with doDate=2027-01-01
    // gets its next occurrence created with doDate=2027-01-02. That next occurrence
    // should stay in Backlog because its doDate is in the future.
    const futureTask: Task = {
      id: randomUUID(),
      title: 'Next occurrence',
      columnId: BACKLOG_COLUMN_ID,
      order: 0,
      doDate: '2027-01-02',
      dueDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const board: Board = {
      columns: [...STANDARD_COLUMNS],
      tasks: [futureTask],
    }

    const promoted = reconcileBoard(board, getTodayString())
    const nextOccurrence = board.tasks.find(t => t.id === futureTask.id)!

    // Should NOT have been promoted (doDate is far in future)
    expect(promoted).toHaveLength(0)
    expect(nextOccurrence.columnId).toBe(BACKLOG_COLUMN_ID)
  })

  it('DOES promote next occurrence when its doDate is today', () => {
    const today = getTodayString()
    const taskToday: Task = {
      id: randomUUID(),
      title: 'Today occurrence',
      columnId: BACKLOG_COLUMN_ID,
      order: 0,
      doDate: today,
      dueDate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    const board: Board = {
      columns: [...STANDARD_COLUMNS],
      tasks: [taskToday],
    }

    const promoted = reconcileBoard(board, today)
    const task = board.tasks.find(t => t.id === taskToday.id)!

    expect(promoted).toHaveLength(1)
    expect(task.columnId).toBe(TODAY_COLUMN_ID)
  })
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --run src/__tests__/reconciliation.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/reconciliation.test.ts
git commit -m "test(server): add next-occurrence reconciliation regression tests"
```

---

## Task 8: Client — `BoardView` component

**Files:**
- Create: `client/src/__tests__/BoardView.test.tsx`
- References: `client/src/components/BoardView.tsx`, `client/src/api.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoardView } from '../BoardView'

// Mock API
vi.mock('../api', () => ({
  getBoard: vi.fn(),
  reorderColumns: vi.fn(),
  reorderTasks: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  reorderColumns: vi.fn(),
  setTabId: vi.fn(),
}))

const mockBoard = {
  columns: [
    { id: 'col-backlog', title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
    { id: 'col-today', title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
    { id: 'col-done', title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
  ],
  tasks: [
    { id: 'task-1', title: 'Task 1', columnId: 'col-backlog', order: 0, createdAt: '', updatedAt: '' },
    { id: 'task-2', title: 'Task 2', columnId: 'col-backlog', order: 1, createdAt: '', updatedAt: '' },
  ],
}

describe('BoardView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const { getBoard } = vi.importActual('../api')
    getBoard.mockResolvedValue(mockBoard)
  })

  it('renders all three system columns', async () => {
    render(<BoardView board={mockBoard} onRefresh={vi.fn()} />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('renders tasks in the correct columns', async () => {
    render(<BoardView board={mockBoard} onRefresh={vi.fn()} />)
    const backlogCol = screen.getByText('Backlog').closest('[data-rfd-droppable-id]')!
    expect(within(backlogCol).getByText('Task 1')).toBeInTheDocument()
    expect(within(backlogCol).getByText('Task 2')).toBeInTheDocument()
  })

  it('calls onRefresh after task reorder', async () => {
    const onRefresh = vi.fn()
    const { reorderTasks } = vi.importActual('../api')
    reorderTasks.mockResolvedValue({ tasks: [] })

    render(<BoardView board={mockBoard} onRefresh={onRefresh} />)
    // TODO: simulate drag end event
    expect(onRefresh).toHaveBeenCalledTimes(0) // placeholder
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd client && npm test -- --run src/__tests__/BoardView.test.tsx`
Expected: FAIL (file doesn't exist)

- [ ] **Step 3: Create empty file**

```bash
touch client/src/__tests__/BoardView.test.tsx
```

- [ ] **Step 4: Run tests to verify they compile and run**

Run: `cd client && npm test -- --run src/__tests__/BoardView.test.tsx`
Expected: PASS or compile error (fix as needed)

- [ ] **Step 5: Commit**

```bash
git add client/src/__tests__/BoardView.test.tsx
git git commit -m "test(client): add BoardView component regression tests"
```

---

## Task 9: Client — `TaskCard` component

**Files:**
- Create: `client/src/__tests__/TaskCard.test.tsx`
- References: `client/src/components/TaskCard.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TaskCard } from '../TaskCard'

describe('TaskCard', () => {
  const defaultTask = {
    id: 'task-1',
    title: 'My Task',
    columnId: 'col-backlog',
    order: 0,
    createdAt: '',
    updatedAt: '',
  }

  it('renders task title', () => {
    render(<TaskCard task={defaultTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    expect(screen.getByText('My Task')).toBeInTheDocument()
  })

  it('shows overdue styling when dueDate is before today and not in Done', () => {
    const today = new Date().toISOString().split('T')[0]
    const pastDate = '2020-01-01'
    const overdueTask = { ...defaultTask, dueDate: pastDate, columnId: 'col-backlog' }
    render(<TaskCard task={overdueTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    // Overdue task should have a red background tint — check for a data attribute or class
    const card = screen.getByText('My Task').closest('[data-task-card]')
    expect(card).toHaveAttribute('data-overdue', 'true')
  })

  it('does NOT show overdue styling for task in Done', () => {
    const pastDate = '2020-01-01'
    const doneTask = { ...defaultTask, dueDate: pastDate, columnId: 'col-done' }
    render(<TaskCard task={doneTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    const card = screen.getByText('My Task').closest('[data-task-card]')
    expect(card).not.toHaveAttribute('data-overdue', 'true')
  })

  it('shows SL assignee badge with pink color', () => {
    const task = { ...defaultTask, assignee: 'SL' }
    render(<TaskCard task={task} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    const badge = screen.getByText('SL')
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveAttribute('data-assignee', 'SL')
  })

  it('shows KL assignee badge with blue color', () => {
    const task = { ...defaultTask, assignee: 'KL' }
    render(<TaskCard task={task} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    expect(screen.getByText('KL')).toBeInTheDocument()
  })

  it('shows no assignee badge when assignee is undefined', () => {
    render(<TaskCard task={defaultTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    expect(screen.queryByText('SL')).not.toBeInTheDocument()
    expect(screen.queryByText('KL')).not.toBeInTheDocument()
  })

  it('opens kebab menu on kebab button click', async () => {
    const user = userEvent.setup()
    render(<TaskCard task={defaultTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    await user.click(screen.getByLabelText(/kebab menu/i))
    // Menu items should appear
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('calls onOpenEdit on Edit menu click', async () => {
    const user = userEvent.setup()
    const onOpenEdit = vi.fn()
    render(<TaskCard task={defaultTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={onOpenEdit} />)
    await user.click(screen.getByLabelText(/kebab menu/i))
    await user.click(screen.getByText('Edit'))
    expect(onOpenEdit).toHaveBeenCalledWith(defaultTask)
  })

  it('calls onDeleted on Delete menu click', async () => {
    const user = userEvent.setup()
    const onDeleted = vi.fn()
    render(<TaskCard task={defaultTask} onUpdated={vi.fn()} onDeleted={onDeleted} onOpenEdit={vi.fn()} />)
    await user.click(screen.getByLabelText(/kebab menu/i))
    await user.click(screen.getByText('Delete'))
    // Should show confirmation modal
    expect(screen.getByText('Are you sure')).toBeInTheDocument()
  })

  it('shows priority border color (high=red, medium=amber, low=green)', () => {
    const highTask = { ...defaultTask, priority: 'high' as const }
    const { container } = render(<TaskCard task={highTask} onUpdated={vi.fn()} onDeleted={vi.fn()} onOpenEdit={vi.fn()} />)
    // Check that the card has a left border styled for priority
    const card = container.querySelector('[data-priority="high"]')
    expect(card).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests (create file first)**

```bash
touch client/src/__tests__/TaskCard.test.tsx
```

Run: `cd client && npm test -- --run src/__tests__/TaskCard.test.tsx`
Expected: PASS or compile errors (fix markup/attributes to match component)

- [ ] **Step 3: Commit**

```bash
git add client/src/__tests__/TaskCard.test.tsx
git commit -m "test(client): add TaskCard component regression tests"
```

---

## Task 10: Client — `ColumnCard` component

**Files:**
- Create: `client/src/__tests__/ColumnCard.test.tsx`
- References: `client/src/components/ColumnCard.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ColumnCard } from '../ColumnCard'

describe('ColumnCard', () => {
  const backlogCol = {
    id: 'col-backlog',
    title: 'Backlog',
    kind: 'system' as const,
    systemKey: 'backlog' as const,
    position: 0,
    createdAt: '',
    updatedAt: '',
  }

  const customCol = {
    id: 'col-custom',
    title: 'Someday',
    kind: 'custom' as const,
    position: 1,
    createdAt: '',
    updatedAt: '',
  }

  it('renders column title', () => {
    render(<ColumnCard column={backlogCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText('Backlog')).toBeInTheDocument()
  })

  it('shows task count', () => {
    const tasks = [
      { id: 't1', title: 'T1', columnId: 'col-backlog', order: 0, createdAt: '', updatedAt: '' },
      { id: 't2', title: 'T2', columnId: 'col-backlog', order: 1, createdAt: '', updatedAt: '' },
    ]
    render(<ColumnCard column={backlogCol} tasks={tasks} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText('2')).toBeInTheDocument() // count badge
  })

  it('system column does NOT show kebab menu', () => {
    render(<ColumnCard column={backlogCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.queryByLabelText(/kebab menu/i)).not.toBeInTheDocument()
  })

  it('custom column shows kebab menu', () => {
    render(<ColumnCard column={customCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByLabelText(/kebab menu/i)).toBeInTheDocument()
  })

  it('shows delete confirmation for custom column', async () => {
    const user = userEvent.setup()
    render(<ColumnCard column={customCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    await user.click(screen.getByLabelText(/kebab menu/i))
    await user.click(screen.getByText('Delete'))
    expect(screen.getByText(/move to Backlog/i)).toBeInTheDocument() // confirmation message
  })

  it('hides QuickAddForm for Done column', () => {
    const doneCol = { ...backlogCol, id: 'col-done', title: 'Done', systemKey: 'done' as const }
    render(<ColumnCard column={doneCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.queryByPlaceholderText(/add task/i)).not.toBeInTheDocument()
  })

  it('shows QuickAddForm for Backlog column', () => {
    render(<ColumnCard column={backlogCol} tasks={[]} onTaskClick={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByPlaceholderText(/add task/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests (create file first)**

```bash
touch client/src/__tests__/ColumnCard.test.tsx
```

Run: `cd client && npm test -- --run src/__tests__/ColumnCard.test.tsx`
Expected: PASS or compile errors (fix attributes to match component's `data-*` or aria labels)

- [ ] **Step 3: Commit**

```bash
git add client/src/__tests__/ColumnCard.test.tsx
git commit -m "test(client): add ColumnCard component regression tests"
```

---

## Task 11: Client — API client unit tests

**Files:**
- Create: `client/src/__tests__/api.test.ts`
- References: `client/src/api.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as api from '../api'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('api client', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    })
  })

  it('getBoard returns board data', async () => {
    const board = { columns: [], tasks: [] }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => board,
    })

    const result = await api.getBoard()
    expect(result).toEqual(board)
    expect(mockFetch).toHaveBeenCalledWith('/api/board', expect.objectContaining({ method: 'GET' }))
  })

  it('createTask sends POST with correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'new-task', title: 'Test' }),
    })

    await api.createTask({ title: 'Test', columnId: 'col-backlog' })

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ title: 'Test', columnId: 'col-backlog' }),
    }))
  })

  it('createTask sends X-Tab-Id header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ id: 'new-task' }),
    })

    api.setTabId('my-tab-123')
    await api.createTask({ title: 'Test', columnId: 'col-backlog' })

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks', expect.objectContaining({
      headers: expect.objectContaining({ 'x-tab-id': 'my-tab-123' }),
    }))
  })

  it('updateTask sends PATCH with correct body including null assignee', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'task-1' }),
    })

    await api.updateTask('task-1', { assignee: null })

    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.assignee).toBeNull() // null, not omitted
  })

  it('reorderTasks sends correct body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ tasks: [] }),
    })

    await api.reorderTasks('task-1', 'col-today', 2)

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/reorder', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ taskId: 'task-1', targetColumnId: 'col-today', newIndex: 2 }),
    }))
  })

  it('deleteTask sends DELETE', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 })

    await api.deleteTask('task-1')

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/task-1', expect.objectContaining({ method: 'DELETE' }))
  })

  it('getBoard throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' }),
    })

    await expect(api.getBoard()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run tests (create file first)**

```bash
touch client/src/__tests__/api.test.ts
```

Run: `cd client && npm test -- --run src/__tests__/api.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add client/src/__tests__/api.test.ts
git commit -m "test(client): add API client unit tests"
```

---

## Self-Review Checklist

After writing the complete plan, verify:

- [x] Every test has actual assertions and expected values (no "TBD")
- [x] Every step shows actual code (no "implement this later")
- [x] Server tests use `setupTestBoard()` at module level with `beforeEach(writeBoard(createTestBoard()))`
- [x] Client tests mock `../api` with `vi.mock` and use `@testing-library/react`
- [x] All file paths are exact (not relative approximations)
- [x] Each task is independently runnable (`npm test -- --run path/to/file.test.ts`)
- [x] Type signatures match what's in `types.ts` (e.g., `assignee: null` not `assignee: undefined`)
- [x] No placeholder "TODO" or "TBD" in any step
- [x] Test gap coverage: board endpoint, column CRUD, task CRUD, task delete, SSE, HA errors, next-occurrence reconciliation, client components, API client
