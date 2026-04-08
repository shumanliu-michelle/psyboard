# Tasks Query API + Done Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Done column timezone filter to use local time, add a flexible `GET /api/tasks` query endpoint with field-based filters, wire the client Done pagination to it, and update the psyboard skill.

**Architecture:**
- `GET /api/board` — fix timezone to use local midnight for 7-day boundary; keeps all board state
- `GET /api/tasks` (new) — flexible task query endpoint with field-based filters; returns only `{ tasks, hasMore }`
- Schema endpoint updated to include the new `/api/tasks` endpoint
- psyboard SKILL.md rewritten to teach psyduck both `/api/board` (full board state) and `/api/tasks` (targeted queries)

**Tech Stack:** Express + TypeScript (server), Vitest for tests

---

## File Map

```
server/src/
  routes/
    board.ts          # MODIFY — fix timezone (already done, commit exists)
    schema.ts         # MODIFY — add queryTasks endpoint definition
    tasks.ts          # CREATE — new route for GET /api/tasks
  __tests__/
    board.test.ts     # MODIFY — add query param tests for board
    tasks.test.ts     # CREATE — tests for GET /api/tasks
  index.ts            # MODIFY — register /api/tasks route
client/src/
  api/index.ts        # MODIFY — add queryTasks() client method
  components/
    ColumnCard.tsx    # MODIFY — wire Done load-more to GET /api/tasks
docs/superpowers/
  specs/2026-04-06-psyduck-psyboard-integration-design.md  # MODIFY — add tasks query
/Users/shumanliu/Downloads/workspace-psyduck/skills/psyboard/
  SKILL.md            # MODIFY — full rewrite with /api/board + /api/tasks usage
```

Note: Task 1 (timezone fix) is already committed (commit `eca8021`). Task 2 onward is pending.

---

## API Design: `GET /api/tasks`

A flexible, composable task query endpoint. Query params are the literal task field names with operator suffixes.

### Field Operators

Each task field can be used as a query param with optional operator suffix:

| Field | Operators | Example | Meaning |
|-------|-----------|---------|---------|
| `columnId` | `eq` (default) | `columnId=eq:col-today` | Tasks in Today column |
| `columnId` | `ne` | `columnId=ne:col-done` | Tasks NOT in Done |
| `title` | `cont` | `title=cont:refill` | Title contains "refill" |
| `completedAt` | `gte`, `lt` | `completedAt=gte:2026-04-01` | Done on/after Apr 1 |
| `dueDate` | `eq`, `gt`, `lt`, `gte`, `lte` | `dueDate=eq:2026-04-07` | Due exactly Apr 7 |
| `doDate` | `eq`, `gt`, `lt`, `gte`, `lte` | `doDate=gte:2026-04-07` | Do date on/after Apr 7 |
| `priority` | `eq` | `priority=eq:high` | High priority |
| `assignee` | `eq` | `assignee=eq:KL` | Assigned to KL |
| `limit` | — | `limit=20` | Max results (default 50) |
| `offset` | — | `offset=50` | Pagination offset |

### Response

```json
{
  "tasks": [ /* Task[] */ ],
  "hasMore": false
}
```

- `hasMore: true` when total matching tasks exceed limit+offset
- Always sorted by `dueDate` asc, then `doDate` asc, then `order` asc (tasks needing attention first)
- For Done tasks: sorted by `completedAt` desc (most recent first)
- If no tasks match, returns `{ tasks: [], hasMore: false }`

### Example Queries

```
# Tasks due today (excluding Done)
GET /api/tasks?columnId=ne:col-done&dueDate=gte:2026-04-07&dueDate=lte:2026-04-07

# Tasks due tomorrow
GET /api/tasks?columnId=ne:col-done&dueDate=eq:2026-04-08

# Tasks in Today column
GET /api/tasks?columnId=eq:col-today

# High priority tasks not done
GET /api/tasks?columnId=ne:col-done&priority=eq:high

# Load older done tasks (pagination)
GET /api/tasks?columnId=eq:col-done&completedAt=lt:2026-04-01&limit=50&sortBy=completedAt&sortDir=desc

# Tasks containing "vacuum"
GET /api/tasks?title=cont:vacuum

# All tasks assigned to KL with due date today
GET /api/tasks?assignee=eq:KL&dueDate=gte:2026-04-07&dueDate=lte:2026-04-07
```

### Sorting

Default sort for most queries: `dueDate` asc, then `doDate` asc, then `order` asc.
Default sort for Done column queries: `completedAt` desc.
Use `sortBy` and `sortDir` params to override:
- `sortBy`: `dueDate`, `doDate`, `order`, `completedAt`, `createdAt`, `priority`
- `sortDir`: `asc` (default for most), `desc` (default for Done queries)

### Priority Ordering for Sort

When sorting by priority, use weight: high=0, medium=1, low=2 (high priority first).

---

## Task 1: Timezone Fix (ALREADY DONE)

**Status:** Commit `eca8021` already exists — "fix(board): use local midnight for 7-day done filter boundary"

No further action needed.

---

## Task 2: Implement `GET /api/tasks` Query Endpoint

**Files:**
- Create: `server/src/routes/tasks.ts`
- Create: `server/src/routes/__tests__/tasks.test.ts`
- Modify: `server/src/index.ts`
- Modify: `server/src/routes/schema.ts`
- Modify: `server/src/routes/__tests__/schema.test.ts`

### Step 1: Write the failing test

Create `server/src/routes/__tests__/tasks.test.ts`. Tests cover all field operators, sorting, limit/offset, hasMore, and error cases.

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import request from 'supertest'
import { app } from '../../index.js'
import { writeBoard } from '../../store/boardStore.js'
import { setupTestBoard, teardownTestBoard, createTestBoard } from '../../__tests__/testBoard.js'
import { DONE_COLUMN_ID, BACKLOG_COLUMN_ID, TODAY_COLUMN_ID } from '../../types.js'
import type { Task } from '../../types.js'

setupTestBoard()

describe('GET /api/tasks', () => {
  beforeEach(() => {
    writeBoard(createTestBoard())
  })

  afterEach(() => {
    teardownTestBoard()
  })

  // --- Basic ---
  it('returns 200 with tasks array', async () => {
    const res = await request(app).get('/api/tasks')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('tasks')
    expect(res.body).toHaveProperty('hasMore')
    expect(Array.isArray(res.body.tasks)).toBe(true)
  })

  it('returns all tasks when no filters provided', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Today task', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBeGreaterThanOrEqual(2)
  })

  // --- columnId eq ---
  it('filters by columnId=eq', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-backlog', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't-today', title: 'Today task', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-backlog')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-backlog')
    expect(ids).not.toContain('t-today')
  })

  // --- columnId ne ---
  it('filters by columnId=ne', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-backlog', title: 'Backlog task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't-done', title: 'Done task', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=ne:col-done')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-backlog')
    expect(ids).not.toContain('t-done')
  })

  // --- title cont ---
  it('filters by title contains', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Buy groceries', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Clean bathroom', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?title=cont:groceries')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t1')
    expect(ids).not.toContain('t2')
  })

  // --- dueDate eq ---
  it('filters by dueDate=eq', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tomorrow = '2026-04-08'
    const tasks: Task[] = [
      { id: 't-today', title: 'Due today', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: today },
      { id: 't-tomorrow', title: 'Due tomorrow', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: tomorrow },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?dueDate=eq:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-tomorrow')
  })

  // --- dueDate gte + lte (range: "due today") ---
  it('filters by dueDate range', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tasks: Task[] = [
      { id: 't-overdue', title: 'Overdue', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-05' },
      { id: 't-today', title: 'Due today', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: today },
      { id: 't-tomorrow', title: 'Due tomorrow', columnId: TODAY_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-08' },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?dueDate=gte:${today}&dueDate=lte:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-overdue')
    expect(ids).not.toContain('t-tomorrow')
  })

  // --- doDate gte ---
  it('filters by doDate', async () => {
    const now = new Date()
    const today = '2026-04-07'
    const tasks: Task[] = [
      { id: 't-past', title: 'Past do date', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), doDate: '2026-04-05' },
      { id: 't-today', title: 'Do today', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), doDate: today },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get(`/api/tasks?doDate=gte:${today}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-today')
    expect(ids).not.toContain('t-past')
  })

  // --- completedAt lt (Done pagination) ---
  it('filters done tasks by completedAt< for pagination', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-1d', title: 'Done 1 day ago', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-8d', title: 'Done 8 days ago', columnId: DONE_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-15d', title: 'Done 15 days ago', columnId: DONE_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const before10d = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const res = await request(app).get(`/api/tasks?columnId=eq:col-done&completedAt=lt:${encodeURIComponent(before10d)}`)
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-15d')
    expect(ids).not.toContain('t-8d')
    expect(ids).not.toContain('t-1d')
  })

  // --- priority eq ---
  it('filters by priority', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-high', title: 'High priority', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), priority: 'high' as const },
      { id: 't-low', title: 'Low priority', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), priority: 'low' as const },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?priority=eq:high')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-high')
    expect(ids).not.toContain('t-low')
  })

  // --- assignee eq ---
  it('filters by assignee', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-kl', title: 'KL task', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), assignee: 'KL' as const },
      { id: 't-sl', title: 'SL task', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), assignee: 'SL' as const },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?assignee=eq:KL')
    expect(res.status).toBe(200)
    const ids = res.body.tasks.map((t: Task) => t.id)
    expect(ids).toContain('t-kl')
    expect(ids).not.toContain('t-sl')
  })

  // --- limit ---
  it('respects limit param', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Task 2', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't3', title: 'Task 3', columnId: BACKLOG_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBe(2)
  })

  // --- hasMore ---
  it('sets hasMore true when results exceed limit', async () => {
    const now = new Date()
    const tasks: Task[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`, title: `Task ${i}`, columnId: BACKLOG_COLUMN_ID, order: i,
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    }))
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(true)
  })

  it('sets hasMore false when results fit within limit', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=5')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(false)
  })

  // --- offset ---
  it('supports offset for pagination', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't1', title: 'Task 1', columnId: BACKLOG_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't2', title: 'Task 2', columnId: BACKLOG_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString() },
      { id: 't3', title: 'Task 3', columnId: BACKLOG_COLUMN_ID, order: 2, createdAt: now.toISOString(), updatedAt: now.toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?limit=2&offset=2')
    expect(res.status).toBe(200)
    expect(res.body.tasks.length).toBe(1)
    expect(res.body.hasMore).toBe(false)
  })

  // --- sorting ---
  it('sorts by completedAt desc for Done column queries', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-old', title: 'Old', columnId: DONE_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 't-new', title: 'New', columnId: DONE_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), completedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-done')
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].id).toBe('t-new')
    expect(res.body.tasks[1].id).toBe('t-old')
  })

  it('sorts by dueDate asc for non-Done queries', async () => {
    const now = new Date()
    const tasks: Task[] = [
      { id: 't-tomorrow', title: 'Tomorrow', columnId: TODAY_COLUMN_ID, order: 0, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-08' },
      { id: 't-today', title: 'Today', columnId: TODAY_COLUMN_ID, order: 1, createdAt: now.toISOString(), updatedAt: now.toISOString(), dueDate: '2026-04-07' },
    ]
    writeBoard(createTestBoard(tasks))
    const res = await request(app).get('/api/tasks?columnId=eq:col-today')
    expect(res.status).toBe(200)
    expect(res.body.tasks[0].id).toBe('t-today')
    expect(res.body.tasks[1].id).toBe('t-tomorrow')
  })

  // --- invalid param ---
  it('returns 400 for invalid query param', async () => {
    const res = await request(app).get('/api/tasks?columnId=invalid-operator:col-today')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  it('returns 400 for invalid date value', async () => {
    const res = await request(app).get('/api/tasks?dueDate=eq:not-a-date')
    expect(res.status).toBe(400)
    expect(res.body).toHaveProperty('error')
  })

  // --- empty result ---
  it('returns empty array when no tasks match', async () => {
    writeBoard(createTestBoard([]))
    const res = await request(app).get('/api/tasks?columnId=eq:col-done')
    expect(res.status).toBe(200)
    expect(res.body.tasks).toEqual([])
    expect(res.body.hasMore).toBe(false)
  })
})
```

### Step 2: Run tests to verify they fail

Run: `cd server && npm test -- --run src/routes/__tests__/tasks.test.ts`
Expected: FAIL — route doesn't exist yet.

### Step 3: Implement the route

Create `server/src/routes/tasks.ts`. Key implementation notes:
- Parse query string by splitting on `=`: `field=value` or `field=operator:value`
- Supported operators: `eq` (default for most), `ne` (not equal), `cont` (contains), `gte`, `gt`, `lte`, `lt`
- For `columnId=ne:col-done` → parse field=`columnId`, operator=`ne`, value=`col-done`
- For `completedAt=lt:2026-04-01` → parse field=`completedAt`, operator=`lt`, value=`2026-04-01`
- For bare `columnId=col-today` → field=`columnId`, operator=`eq`, value=`col-today`
- Validate date fields: `dueDate`, `doDate`, `completedAt` values must parse as valid dates
- Default limit: 50, max limit: 200
- Compute hasMore by checking if any task would exist beyond limit+offset (without actually loading all tasks — filter then check if more exist in filtered set)
- Sorting: if `columnId=eq:col-done` present, sort by `completedAt` desc; otherwise sort by `dueDate` asc, then `doDate` asc, then `order` asc
- Priority sort: high > medium > low (weight 0, 1, 2)

```typescript
import { Router } from 'express'
import { readBoard } from '../store/boardStore.js'
import { DONE_COLUMN_ID, BACKLOG_COLUMN_ID } from '../types.js'

const router = Router()
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

type TaskFilter = (task: import('../types.js').Task) => boolean

function parseFilterParam(param: string): { field: string; operator: string; value: string } {
  const colonIdx = param.indexOf(':')
  if (colonIdx === -1) {
    return { field: param, operator: 'eq', value: '' }
  }
  const field = param.slice(0, colonIdx)
  const rest = param.slice(colonIdx + 1)
  const valueColonIdx = rest.indexOf(':')
  if (valueColonIdx === -1) {
    return { field, operator: 'eq', value: rest }
  }
  // field=operator:value (e.g. columnId=ne:col-done)
  const operator = rest.slice(0, valueColonIdx)
  const value = rest.slice(valueColonIdx + 1)
  return { field, operator, value }
}

function buildTaskFilter(field: string, operator: string, value: string): TaskFilter | null {
  switch (field) {
    case 'columnId':
    case 'priority':
    case 'assignee':
      return (task) => {
        const fieldValue = task[field as keyof typeof task] as string | undefined
        if (operator === 'eq') return fieldValue === value
        if (operator === 'ne') return fieldValue !== value
        return false
      }
    case 'title':
      return (task) => {
        if (operator === 'cont') return task.title.toLowerCase().includes(value.toLowerCase())
        return false
      }
    case 'dueDate':
    case 'doDate':
    case 'completedAt':
      return (task) => {
        const dateValue = (task as any)[field] as string | undefined
        if (!dateValue) return false
        const taskDate = new Date(dateValue).setHours(0, 0, 0, 0)
        const queryDate = new Date(value).setHours(0, 0, 0, 0)
        const taskMs = new Date(dateValue).getTime()
        const queryMs = new Date(value).getTime()
        switch (operator) {
          case 'eq': return dateValue === value
          case 'gte': return taskMs >= queryMs
          case 'gt': return taskMs > queryMs
          case 'lte': return taskMs <= queryMs
          case 'lt': return taskMs < queryMs
          default: return false
        }
      }
    default:
      return null
  }
}

router.get('/', (req, res) => {
  const { limit: limitStr, offset: offsetStr, sortBy, sortDir } = req.query as Record<string, string>

  // Build filters from query params
  const filters: TaskFilter[] = []
  for (const [key, val] of Object.entries(req.query)) {
    if (key === 'limit' || key === 'offset' || key === 'sortBy' || key === 'sortDir') continue
    if (typeof val !== 'string') continue
    const { field, operator, value } = parseFilterParam(`${key}=${val}`)
    if (field === 'limit' || field === 'offset' || field === 'sortBy' || field === 'sortDir') continue
    if (!value) continue
    // Validate date fields
    if ((field === 'dueDate' || field === 'doDate' || field === 'completedAt') && operator !== 'cont') {
      const parsed = new Date(value)
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: `Invalid date value for ${field}: ${value}` })
        return
      }
    }
    const filterFn = buildTaskFilter(field, operator, value)
    if (filterFn === null) {
      res.status(400).json({ error: `Unknown filter field or operator: ${key}=${val}` })
      return
    }
    filters.push(filterFn)
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(limitStr) || DEFAULT_LIMIT))
  const offset = Math.max(0, parseInt(offsetStr) || 0)

  try {
    const board = readBoard()

    let filtered = board.tasks.filter(task => filters.every(f => f(task)))

    // Determine default sort
    const columnIdFilter = filters.find(f => {
      // Detect if there's a columnId=eq:col-done filter
      return f === filters.find(f => f.toString().includes('columnId'))
    })
    const isDoneQuery = filters.some((f, i) => {
      // Check if any filter is for done column
      const task = { columnId: DONE_COLUMN_ID }
      return f(task)
    })

    // Default sort logic
    const effectiveSortBy = sortBy || (isDoneQuery ? 'completedAt' : 'dueDate')
    const effectiveSortDir = sortDir || (isDoneQuery ? 'desc' : 'asc')

    const PRIORITY_WEIGHT: Record<string, number> = { high: 0, medium: 1, low: 2 }

    filtered.sort((a, b) => {
      let aVal: any, bVal: any
      switch (effectiveSortBy) {
        case 'completedAt':
          aVal = a.completedAt ? new Date(a.completedAt).getTime() : 0
          bVal = b.completedAt ? new Date(b.completedAt).getTime() : 0
          break
        case 'dueDate':
          aVal = a.dueDate ? new Date(a.dueDate).getTime() : Infinity
          bVal = b.dueDate ? new Date(b.dueDate).getTime() : Infinity
          break
        case 'doDate':
          aVal = a.doDate ? new Date(a.doDate).getTime() : Infinity
          bVal = b.doDate ? new Date(b.doDate).getTime() : Infinity
          break
        case 'priority':
          aVal = PRIORITY_WEIGHT[a.priority || 'medium']
          bVal = PRIORITY_WEIGHT[b.priority || 'medium']
          break
        case 'order':
          aVal = a.order
          bVal = b.order
          break
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime()
          bVal = new Date(b.createdAt).getTime()
          break
        default:
          aVal = a.order
          bVal = b.order
      }
      if (aVal < bVal) return effectiveSortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return effectiveSortDir === 'asc' ? 1 : -1
      return 0
    })

    const totalMatching = filtered.length
    const page = filtered.slice(offset, offset + limit)
    const hasMore = offset + limit < totalMatching

    res.json({ tasks: page, hasMore })
  } catch {
    res.status(500).json({ error: 'Failed to query tasks' })
  }
})

export default router
```

### Step 4: Run tests to verify they pass

Run: `cd server && npm test -- --run src/routes/__tests__/tasks.test.ts`
Expected: PASS (all tests)

### Step 5: Register route in index.ts

Add to `server/src/index.ts`:
```typescript
import tasksRouter from './routes/tasks.js'
// ...
app.use('/api/tasks', tasksRouter)
```

### Step 6: Update schema.ts endpoint definition

In `server/src/routes/schema.ts`, add to endpoints:
```typescript
queryTasks: 'GET /api/tasks — flexible task query. Params: columnId, title, dueDate, doDate, completedAt, priority, assignee with operators (eq, ne, gte, gt, lte, lt, cont). limit, offset, sortBy, sortDir. Returns { tasks, hasMore }.',
```

### Step 7: Add test for queryTasks endpoint in schema test

Add to `server/src/routes/__tests__/schema.test.ts`:
```typescript
it('includes queryTasks endpoint', async () => {
  const res = await request(app).get('/api/schema')
  expect(res.body.endpoints).toHaveProperty('queryTasks')
})
```

### Step 8: Run all server tests

Run: `cd server && npm test -- --run`
Expected: All tests pass

### Step 9: Commit

```bash
git add server/src/routes/tasks.ts server/src/routes/__tests__/tasks.test.ts server/src/index.ts server/src/routes/schema.ts server/src/routes/__tests__/schema.test.ts
git commit -m "feat: add GET /api/tasks flexible query endpoint"
```

---

## Task 3: Wire Client "Load Older" to `GET /api/tasks`

**Files:**
- Modify: `client/src/api/index.ts` — add `queryTasks()` method
- Modify: `client/src/components/ColumnCard.tsx`

### Step 1: Add queryTasks client method

In `client/src/api/index.ts`:

```typescript
export async function queryTasks(params: {
  columnId?: string
  columnIdOp?: 'eq' | 'ne'
  completedAtOp?: 'gte' | 'lt'
  completedAt?: string
  dueDateOp?: 'eq' | 'gte' | 'lte' | 'lt'
  dueDate?: string
  doDateOp?: 'eq' | 'gte' | 'lt'
  doDate?: string
  priority?: string
  assignee?: string
  titleCont?: string
  limit?: number
  offset?: number
  sortBy?: 'dueDate' | 'doDate' | 'completedAt' | 'order' | 'priority' | 'createdAt'
  sortDir?: 'asc' | 'desc'
}): Promise<{ tasks: Task[], hasMore: boolean }> {
  const searchParams = new URLSearchParams()
  if (params.columnId) searchParams.set(`columnId=${params.columnIdOp || 'eq'}`, params.columnId)
  if (params.completedAt) searchParams.set(`completedAt=${params.completedAtOp || 'lt'}`, params.completedAt)
  if (params.dueDate) searchParams.set(`dueDate=${params.dueDateOp || 'eq'}`, params.dueDate)
  if (params.doDate) searchParams.set(`doDate=${params.doDateOp || 'eq'}`, params.doDate)
  if (params.priority) searchParams.set('priority=eq', params.priority)
  if (params.assignee) searchParams.set('assignee=eq', params.assignee)
  if (params.titleCont) searchParams.set('title=cont', params.titleCont)
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit))
  if (params.offset !== undefined) searchParams.set('offset', String(params.offset))
  if (params.sortBy) searchParams.set('sortBy', params.sortBy)
  if (params.sortDir) searchParams.set('sortDir', params.sortDir)

  const res = await fetch(`/api/tasks?${searchParams.toString()}`)
  if (!res.ok) throw new Error('Failed to query tasks')
  return res.json()
}
```

### Step 2: Wire ColumnCard "Load Older" button to queryTasks

Current `ColumnCard.tsx` has a broken client-side pagination for Done. Replace with:
- When `donePage === 0`: show visibleDoneTasks (client-side filtered from props)
- When `donePage > 0`: call `queryTasks({ columnId: 'col-done', completedAtOp: 'lt', completedAt: oldestCompletedAt })`

```typescript
// In ColumnCard.tsx
const [olderDoneTasks, setOlderDoneTasks] = useState<Task[]>([])
const [doneHasMore, setDoneHasMore] = useState(false)

async function handleLoadOlderDone() {
  const oldestCompletedAt = allDoneTasks[allDoneTasks.length - 1]?.completedAt
  if (!oldestCompletedAt) return
  try {
    const { tasks, hasMore } = await queryTasks({
      columnId: 'col-done',
      columnIdOp: 'eq',
      completedAtOp: 'lt',
      completedAt: oldestCompletedAt,
      limit: 50,
    })
    setOlderDoneTasks(tasks)
    setDoneHasMore(hasMore)
    setDonePage(p => p + 1)
  } catch {
    // silently fail
  }
}
```

Update footer button to call `handleLoadOlderDone()`.

### Step 3: Run client tests

Run: `cd client && npm test -- --run`
Expected: All tests pass

### Step 4: Commit

```bash
git add client/src/api/index.ts client/src/components/ColumnCard.tsx
git commit -m "feat(client): wire Done load-more to GET /api/tasks"
```

---

## Task 4: Update psyboard SKILL.md

**Files:**
- Modify: `/Users/shumanliu/Downloads/workspace-psyduck/skills/psyboard/SKILL.md`

Rewrite to document both `/api/board` and `/api/tasks`, with clear guidance on when to use each.

The full updated skill content:

```markdown
# psyboard Skill

The psyboard skill provides task management capabilities via a local Kanban board API.

## Session Startup

At the start of each session, fetch the board schema:

```
exec curl -s http://localhost:3001/api/schema
```

Store the schema for reference when constructing API calls.

## API Base URL

```
http://localhost:3001
```

## When to Use Which Endpoint

### `GET /api/board` — Full Board State
Use for: loading the complete board (all columns + all active tasks).

Returns the full board. Done tasks are filtered to the last 7 days by default.

```
exec curl -s http://localhost:3001/api/board | jq '.tasks'
```

### `GET /api/tasks` — Targeted Task Queries
Use for: answering specific questions about tasks (due today, tomorrow, high priority, etc.).

**Query params format:** `field=operator:value`
- Operators: `eq` (equals), `ne` (not equals), `gte` (on or after), `gt` (after), `lte` (on or before), `lt` (before), `cont` (contains)
- For bare `field=value`, defaults to `eq`

**Common queries:**

What's on my plate today (tasks due today or earlier, not done):
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&dueDate=gte:2026-04-07&dueDate=lte:2026-04-07" | jq '.tasks'
```

Tasks due tomorrow:
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&dueDate=eq:2026-04-08" | jq '.tasks'
```

High priority tasks not done:
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&priority=eq:high" | jq '.tasks'
```

Tasks assigned to me (KL):
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&assignee=eq:KL" | jq '.tasks'
```

Tasks containing keyword (e.g. "vacuum"):
```
exec curl -s "http://localhost:3001/api/tasks?title=cont:vacuum" | jq '.tasks'
```

Tasks in a specific column:
```
exec curl -s "http://localhost:3001/api/tasks?columnId=eq:col-today" | jq '.tasks'
```

Load older Done tasks (pagination — most recent first):
```
# Replace <OLDEST_COMPLETED_AT> with the completedAt of the oldest currently visible Done task
exec curl -s "http://localhost:3001/api/tasks?columnId=eq:col-done&completedAt=lt:<OLDEST_COMPLETED_AT>" | jq '.tasks'
```

**Sorting and pagination:**
```
# Default sort: dueDate asc (soonest first). Done tasks sorted by completedAt desc.
# For custom sort: add &sortBy=dueDate&sortDir=asc
# For pagination: &limit=20&offset=0 (offset skips first N results)
# hasMore: true in response means more results exist beyond limit+offset
```

**Response format:**
```json
{ "tasks": [...], "hasMore": false }
```

## Create Task

```
exec curl -s -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "Task title", "columnId": "col-todo", "description": "Optional description", "dueDate": "2026-04-10"}'
```

Response includes the created task with id.

## Update Task

Partial update — only include fields to change:

```
exec curl -s -X PATCH http://localhost:3001/api/tasks/:id \
  -H "Content-Type: application/json" \
  -d '{"columnId": "col-today", "order": 0}'
```

Common updates:
- Move to different column: `{"columnId": "col-today"}`
- Update title: `{"title": "New title"}`
- Update description: `{"description": "New description"}`
- Set due date: `{"dueDate": "2026-04-15"}`
- Mark complete: `{"columnId": "col-done", "completedAt": "2026-04-07T10:00:00Z"}`

## Delete Task

```
exec curl -s -X DELETE http://localhost:3001/api/tasks/:id
```

## Create Column

```
exec curl -s -X POST http://localhost:3001/api/columns \
  -H "Content-Type: application/json" \
  -d '{"title": "Column Name", "order": 5}'
```

## Home Assistant Sensors (on-demand only)

Get live HA sensor readings when user asks about a specific device (e.g. "how full is the litter robot?"):

```
exec curl -s http://localhost:3001/api/ha/sensors
```

Returns: all HA entity states. Use ONLY when user asks directly.

## Column Inference

When a task is created without specifying columnId, infer the column from keywords in the title:

| Column | Keywords |
|--------|----------|
| Today | today, asap, urgent, important, immediately |
| Backlog | later, someday, maybe, eventually, low priority |
| Shopping | shop, buy, grocery, store, order, amazon |
| Appointments | appointment, doctor, dentist, meeting, interview, schedule |

Default column if no keywords match: `col-backlog` (Backlog)

## Completion Flow

To mark a task as complete:

1. Find the task:
   ```
   exec curl -s http://localhost:3001/api/board | jq '.tasks[] | select(.title | contains("TASK_KEYWORD"))'
   ```

2. Confirm task id and current state

3. Move to Done column:
   ```
   exec curl -s -X PATCH http://localhost:3001/api/tasks/:id \
     -H "Content-Type: application/json" \
     -d '{"columnId": "col-done", "completedAt": "2026-04-07T10:00:00Z"}'
   ```

## Schema Refresh

If you encounter an unrecognized column error:

1. Re-fetch the schema:
   ```
   exec curl -s http://localhost:3001/api/schema
   ```

2. Check available column IDs and titles

3. Retry the operation with the correct columnId

**Note:** Column IDs may change when columns are created or deleted. Fetch the schema at session startup and after any board structural change.

## Column IDs

Column IDs are returned by `GET /api/schema` at session startup. Do not hardcode column IDs — always fetch the schema first and use the IDs from the response.

Common columns (verify with schema):
- `col-backlog` — Backlog
- `col-today` — Today
- `col-done` — Done

## Error Handling

API errors return `{ "error": "description" }`. Check for errors in responses before proceeding.

## Notes

- All timestamps in ISO 8601 format (e.g. `2026-04-07T10:00:00Z`)
- Task ids are strings (e.g. `task-abc123`)
- Order fields determine sort position within columns (lower = higher in list)
- The board API runs on port 3001 by default
- Due dates are local dates (YYYY-MM-DD format)
- For recurring tasks: the next occurrence's dueDate/doDate reflects the calculated next date, not the original recurring task's date
```

### Step 2: Commit SKILL.md to workspace-psyduck repo

From workspace-psyduck repo:

```bash
cd /Users/shumanliu/Downloads/workspace-psyduck
git add skills/psyboard/SKILL.md
git commit -m "feat: add GET /api/tasks query endpoint and rewrite endpoint usage guide"
```

---

## Task 5: Update Integration Spec

**Files:**
- Modify: `docs/superpowers/specs/2026-04-06-psyduck-psyboard-integration-design.md`

Add a section for the tasks query API:

```markdown
### Task Query API (`GET /api/tasks`)

A flexible task query endpoint for targeted lookups. Supports field-based filters with operators.

```
GET /api/tasks?columnId=ne:col-done&dueDate=gte:2026-04-07&dueDate=lte:2026-04-07
```

Returns `{ tasks: Task[], hasMore: boolean }`. Psyduck uses this for reminder queries (due today, tomorrow, high priority, etc.) and Done task pagination.
```

Also update the existing endpoints table to include `queryTasks`.

Commit:
```bash
git add docs/superpowers/specs/2026-04-06-psyduck-psyboard-integration-design.md
git commit -m "docs: add GET /api/tasks query endpoint to integration spec"
```
