# psyduck + psyboard Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the psyboard side of the psyduck-psyboard integration — three new REST endpoints and one SSE event extension. The psyduck-side tool registration (OpenClaw skill) requires further investigation and is noted separately.

**Architecture:**
- `GET /api/schema` — reads from existing board data, assembles schema response
- `GET /api/ha/sensors` — reuses existing `getAllStates()` from haClient.ts, maps relevant entities to structured sensor response
- SSE `schema_updated` — add `broadcastSchemaUpdated()` call to column create/delete/update routes

**Tech Stack:** Express + TypeScript (server), Vitest for tests

---

## File Map

```
server/src/
  routes/
    schema.ts          # CREATE — new route file for GET /api/schema
    haSensors.ts      # CREATE — new route file for GET /api/ha/sensors
    events.ts         # MODIFY — add broadcastSchemaUpdated()
    columns.ts        # MODIFY — emit schema_updated after column mutations
  index.ts            # MODIFY — register new routes
  home-assistant/
    haClient.ts       # ALREADY EXISTS — getAllStates() already implemented
    config.ts        # ALREADY EXISTS — loadHAEnv() already implemented
```

Jobs file (psyduck workspace):
```
/Users/shumanliu/Downloads/jobs.json   # MODIFY — update cron job prompts, delete one job
```

---

## Task 1: `GET /api/schema` Endpoint

**Files:**
- Create: `server/src/routes/schema.ts`
- Test: `server/src/routes/__tests__/schema.test.ts`
- Register in: `server/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/routes/__tests__/schema.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import schemaRouter from '../schema.js'
import { readBoard } from '../../store/boardStore.js'
import { resetAllStores } from '../../store/testUtils.js'

describe('GET /api/schema', () => {
  beforeEach(() => { resetAllStores() })

  it('returns columns and task field definitions', async () => {
    const app = express()
    app.use('/api', schemaRouter)
    const res = await request(app).get('/api/schema')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('columns')
    expect(res.body).toHaveProperty('taskFields')
    expect(res.body).toHaveProperty('endpoints')
  })

  it('includes system columns (Backlog, Today, Done)', async () => {
    const app = express()
    app.use('/api', schemaRouter)
    const res = await request(app).get('/api/schema')
    const titles = res.body.columns.map((c: { title: string }) => c.title)
    expect(titles).toContain('Backlog')
    expect(titles).toContain('Today')
    expect(titles).toContain('Done')
  })

  it('includes all endpoint definitions', async () => {
    const app = express()
    app.use('/api', schemaRouter)
    const res = await request(app).get('/api/schema')
    expect(res.body.endpoints).toHaveProperty('getBoard')
    expect(res.body.endpoints).toHaveProperty('getSchema')
    expect(res.body.endpoints).toHaveProperty('createColumn')
    expect(res.body.endpoints).toHaveProperty('deleteColumn')
    expect(res.body.endpoints).toHaveProperty('createTask')
    expect(res.body.endpoints).toHaveProperty('updateTask')
    expect(res.body.endpoints).toHaveProperty('deleteTask')
    expect(res.body.endpoints).toHaveProperty('reorderTasks')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run src/routes/__tests__/schema.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the route**

```typescript
// server/src/routes/schema.ts
import { Router } from 'express'
import { readBoard } from '../store/boardStore.js'

const router = Router()

router.get('/', (_req, res) => {
  try {
    const board = readBoard()
    const columns = board.columns.map(col => ({
      id: col.id,
      title: col.title,
      kind: col.kind,
      systemKey: col.systemKey,
    }))

    res.json({
      columns,
      taskFields: {
        columnId: 'string',
        title: 'string',
        description: 'string?',
        doDate: 'YYYY-MM-DD?',
        dueDate: 'YYYY-MM-DD?',
        priority: 'low | medium | high?',
        assignee: 'SL | KL?',
        recurrence: 'RecurrenceConfig?',
        completedAt: 'ISO datetime?',
      },
      endpoints: {
        getBoard: 'GET /api/board',
        getSchema: 'GET /api/schema',
        getHASensors: 'GET /api/ha/sensors',
        getEvents: 'GET /api/events (SSE stream)',
        createColumn: 'POST /api/columns { title, accent? }',
        deleteColumn: 'DELETE /api/columns/:id',
        createTask: 'POST /api/tasks { title, columnId, description?, doDate?, dueDate?, priority?, assignee?, recurrence? }',
        updateTask: 'PATCH /api/tasks/:id { title?, columnId?, doDate?, dueDate?, priority?, assignee?, recurrence?, completedAt?, suppressNextOccurrence?, expectedUpdatedAt? }',
        deleteTask: 'DELETE /api/tasks/:id',
        reorderTasks: 'POST /api/tasks/reorder { taskId, targetColumnId, newIndex }',
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'Failed to read schema' })
  }
})

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run src/routes/__tests__/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Register route in index.ts**

```typescript
// server/src/index.ts — add import and app.use
import schemaRouter from './routes/schema.js'
// ...
app.use('/api/schema', schemaRouter)
```

- [ ] **Step 6: Run all tests**

Run: `cd server && npm test -- --run`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/schema.ts server/src/routes/__tests__/schema.test.ts server/src/index.ts
git commit -m "feat(api): add GET /api/schema endpoint

Returns board columns, task field definitions, and all available
API endpoints for psyduck tool registration.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: `GET /api/ha/sensors` Endpoint

**Files:**
- Create: `server/src/routes/haSensors.ts`
- Test: `server/src/routes/__tests__/haSensors.test.ts`
- Register in: `server/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// server/src/routes/__tests__/haSensors.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import haSensorsRouter from '../haSensors.js'
import * as haClient from '../../home-assistant/haClient.js'
import { resetHAWSState } from '../../home-assistant/haWebSocket.js'

describe('GET /api/ha/sensors', () => {
  beforeEach(() => {
    resetHAWSState()
    vi.restoreAllMocks()
  })

  it('returns structured sensor data', async () => {
    vi.spyOn(haClient, 'getAllStates').mockResolvedValue([
      { entity_id: 'sensor.absol_waste_drawer', state: '75', attributes: { friendly_name: 'Waste Drawer' } },
      { entity_id: 'sensor.absol_hopper_status', state: 'enabled', attributes: {} },
      { entity_id: 'sensor.absol_pet_weight', state: '11.5', attributes: {} },
      { entity_id: 'sensor.absol_visits_today', state: '3', attributes: {} },
      { entity_id: 'binary_sensor.s8_maxv_ultra_water_shortage', state: 'on', attributes: {} },
      { entity_id: 'binary_sensor.s8_maxv_ultra_dock_dirty_water_box', state: 'off', attributes: {} },
      { entity_id: 'sensor.s8_maxv_ultra_status', state: 'running', attributes: {} },
      { entity_id: 'binary_sensor.roborock_s7_maxv_water_shortage', state: 'off', attributes: {} },
      { entity_id: 'sensor.roborock_s7_maxv_status', state: 'idle', attributes: {} },
    ])

    const app = express()
    app.use('/api', haSensorsRouter)
    const res = await request(app).get('/api/ha/sensors')
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('litterRobot')
    expect(res.body).toHaveProperty('vacuums')
    expect(res.body).toHaveProperty('timestamp')
    expect(res.body.litterRobot.wasteDrawerPercent).toBe(75)
    expect(res.body.litterRobot.hopperStatus).toBe('enabled')
    expect(res.body.litterRobot.petWeight).toBe(11.5)
    expect(res.body.litterRobot.visitsToday).toBe(3)
  })

  it('returns 500 when HA is unreachable', async () => {
    vi.spyOn(haClient, 'getAllStates').mockRejectedValue(new Error('Connection refused'))
    const app = express()
    app.use('/api', haSensorsRouter)
    const res = await request(app).get('/api/ha/sensors')
    expect(res.status).toBe(500)
    expect(res.body).toHaveProperty('error')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- --run src/routes/__tests__/haSensors.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the route**

```typescript
// server/src/routes/haSensors.ts
import { Router } from 'express'
import { loadHAEnv } from '../home-assistant/config.js'
import { getAllStates } from '../home-assistant/haClient.js'

const router = Router()

router.get('/', async (_req, res) => {
  let env: ReturnType<typeof loadHAEnv>
  try {
    env = loadHAEnv()
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    return
  }

  let entities: Awaited<ReturnType<typeof getAllStates>>
  try {
    entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })
  } catch (err) {
    res.status(500).json({ error: `Home Assistant request failed: ${(err as Error).message}` })
    return
  }

  const entityMap = new Map(entities.map(e => [e.entity_id, e]))

  const getNum = (id: string): number | undefined => {
    const e = entityMap.get(id)
    return e ? parseFloat(e.state) : undefined
  }
  const getStr = (id: string): string | undefined => entityMap.get(id)?.state
  const getBool = (id: string): boolean | undefined => {
    const e = entityMap.get(id)
    return e ? e.state === 'on' : undefined
  }

  res.json({
    litterRobot: {
      wasteDrawerPercent: getNum('sensor.absol_waste_drawer'),
      hopperStatus: getStr('sensor.absol_hopper_status'),
      petWeight: getNum('sensor.absol_pet_weight'),
      visitsToday: getNum('sensor.absol_visits_today') ? Math.floor(getNum('sensor.absol_visits_today')!) : undefined,
    },
    vacuums: {
      s8MaxvUltra: {
        waterShortage: getBool('binary_sensor.s8_maxv_ultra_water_shortage'),
        dirtyWaterFull: getBool('binary_sensor.s8_maxv_ultra_dock_dirty_water_box'),
        status: getStr('sensor.s8_maxv_ultra_status'),
      },
      s7Maxv: {
        waterShortage: getBool('binary_sensor.roborock_s7_maxv_water_shortage'),
        status: getStr('sensor.roborock_s7_maxv_status'),
      },
    },
    timestamp: new Date().toISOString(),
  })
})

export default router
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- --run src/routes/__tests__/haSensors.test.ts`
Expected: PASS

- [ ] **Step 5: Register route in index.ts**

```typescript
// server/src/index.ts — add import and app.use
import haSensorsRouter from './routes/haSensors.js'
// ...
app.use('/api/ha/sensors', haSensorsRouter)
```

- [ ] **Step 6: Run all tests**

Run: `cd server && npm test -- --run`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/haSensors.ts server/src/routes/__tests__/haSensors.test.ts server/src/index.ts
git commit -m "feat(api): add GET /api/ha/sensors endpoint

Returns structured HA sensor data for psyduck on-demand queries.
Reuses existing getAllStates() from haClient.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: SSE `schema_updated` Event

**Files:**
- Modify: `server/src/routes/events.ts` — add `broadcastSchemaUpdated()`
- Modify: `server/src/routes/columns.ts` — call `broadcastSchemaUpdated()` after column mutations

- [ ] **Step 1: Add broadcastSchemaUpdated to events.ts**

Read `server/src/routes/events.ts` first (already done above — lines 1-79).

Add this export to `server/src/routes/events.ts`:

```typescript
// Add after the existing broadcast function, before "export default router"
export function broadcastSchemaUpdated(): void {
  const payload = JSON.stringify({ type: 'schema_updated' })
  const message = `data: ${payload}\n\n`
  console.log('[SSE] Broadcasting schema_updated to all clients')

  const deadClients: express.Response[] = []
  for (const [client] of clients) {
    try {
      client.write(message)
    } catch {
      deadClients.push(client)
    }
  }
  for (const dead of deadClients) {
    clients.delete(dead)
  }
}
```

- [ ] **Step 2: Verify events.ts compiles**

Run: `cd server && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Import and call in columns.ts after column mutations**

Add import at top of `server/src/routes/columns.ts`:
```typescript
import { broadcastSchemaUpdated } from './events.js'
```

After `createColumn()` in `router.post('/')`:
```typescript
const column = createColumn(title.trim(), accent)
broadcastSchemaUpdated()  // ← add this line after successful create
res.status(201).json(column)
```

After `deleteColumn()` in `router.delete('/:id')`:
```typescript
deleteColumn(id)
broadcastSchemaUpdated()  // ← add this line after successful delete
res.status(204).send()
```

After `updateColumn()` in `router.patch('/:id')`:
```typescript
const column = updateColumn(id, updates)
broadcastSchemaUpdated()  // ← add this line after successful update
res.json(column)
```

After `reorderColumns()` in `router.post('/reorder')`:
```typescript
const columns = reorderColumns(columnIds)
broadcastSchemaUpdated()  // ← add this line after successful reorder
res.json({ columns })
```

- [ ] **Step 4: Run all tests**

Run: `cd server && npm test -- --run`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/events.ts server/src/routes/columns.ts
git commit -m "feat(sse): broadcast schema_updated on column mutations

Emits schema_updated SSE event when columns are created, deleted,
updated, or reordered. psyduck main session listens for this to
keep its board tool definitions in sync.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Cron Job Updates (psyduck workspace)

**Files:**
- Modify: `/Users/shumanliu/Downloads/jobs.json`

- [ ] **Step 1: Delete `state-prep-household-morning` job**

Remove the job object with `id: "state-prep-household-morning"` from the `jobs` array.

- [ ] **Step 2: Update `Daily morning household reminder` job prompt**

Replace the `payload.message` string with:

```
Send a morning household reminder to Slack channel C0AN2T02SNQ.

**Format — include these sections:**
1. **Weather** — Sammamish, WA 98074: current conditions and today's temperature range in °C
2. **Tasks due today** — check psyboard: all tasks where dueDate or doDate is today (exclude Done column). Group by priority if multiple.
3. **Tasks due tomorrow** — psyboard: tasks due tomorrow, heads-up
4. **High-priority / overdue** — psyboard: any high-priority tasks overdue or due today
5. **Shopping list summary** — psyboard: what's in the Shopping column (if non-empty)
6. **Appointments today/tomorrow** — psyboard: tasks in Appointments column due today or tomorrow
7. **HA alerts** — psyboard: any HA-sensor-triggered tasks that need attention (e.g. litter robot, vacuum alerts — these appear as tasks on psyboard when thresholds are breached)

**Rules:**
- Use psyboard_query to fetch tasks by due date, do date, column, and priority
- HA device alerts come through psyboard tasks (created by psyboard's HA integration), not directly from HA
- Format tasks clearly: title, due date, priority, @assignee
- Use natural household wording — not stiff task-manager phrasing
- Keep it short, structured, and easy to scan
- Omit sections with nothing to report
```

- [ ] **Step 3: Update `Daily evening household reminder` job prompt**

Replace the `payload.message` string with:

```
Send an evening household reminder to Slack channel C0AN2T02SNQ.

**Format — structure:**

1. **Still on your plate tonight** — All tasks due today (dueDate <= today) that are NOT in Done. Show high-priority first, then medium, then low. Include task title and column. Keep it scannable.

2. **Tomorrow's appointments** — Tasks in the Appointments column due tomorrow. A simple heads-up so the household can prepare.

3. **HA alerts** — Any urgent HA alerts (e.g. litter robot waste drawer full or only 1-2 cycles left). Check via psyboard_ha_sensors — include only if genuinely urgent.

**Rules:**
- Use psyboard_query to fetch tasks by dueDate, column, and priority
- Use psyboard_ha_sensors for HA alert check (high-priority HA device status)
- Sort by priority: high → medium → low
- Keep the tone calm, structured, low-noise, and natural
- Omit sections with nothing to report
- If nothing relevant applies, send a minimal check-in or stay silent
```

- [ ] **Step 4: Commit**

```bash
git add /Users/shumanliu/Downloads/jobs.json
git commit -m "chore(psyduck): update cron jobs for psyboard integration

- Delete state-prep-household-morning job (no longer needed)
- Update morning reminder to pull from psyboard tasks
- Update evening reminder to focus on due-date tasks + HA alerts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: psyduck OpenClaw Tool Registration (TBD)

**This task requires further investigation of OpenClaw's skill/plugin system.**

What needs to happen:
- Register 6 psyduck tools in the main session, built dynamically from `GET /api/schema`:
  - `psyboard_query` — query tasks by column, dueBy, doBy, assignee, priority, search, includeDone
  - `psyboard_create_task` — create task with all fields
  - `psyboard_update_task` — update/move/complete task
  - `psyboard_delete_task` — delete task
  - `psyboard_create_column` — create column
  - `psyboard_ha_sensors` — HA live sensor data (on-demand)

- Main session startup behavior:
  1. Fetch `GET /http://localhost:3001/api/schema` → build tool definitions
  2. Connect SSE to `GET /http://localhost:3001/api/events` → listen for `schema_updated`
  3. On `schema_updated` → refetch schema → rebuild tools

The tool definitions should be constructed from the `endpoints` and `columns` returned by `GET /api/schema`, with parameters derived from `taskFields`.

This likely requires creating an OpenClaw skill in the psyduck workspace. Investigate OpenClaw skill format before implementing.

---

## Self-Review Checklist

**Spec coverage:**
- ✅ `GET /api/schema` — Task 1
- ✅ `GET /api/ha/sensors` — Task 2
- ✅ SSE `schema_updated` — Task 3
- ✅ Column create/delete/update → `broadcastSchemaUpdated()` — Task 3
- ✅ Cron job `state-prep-household-morning` deleted — Task 4
- ✅ Morning reminder updated — Task 4
- ✅ Evening reminder updated — Task 4
- ⚠️ psyduck tool registration — Task 5 (TBD — OpenClaw skill investigation needed)

**Placeholder scan:** No TBD/TODOs in code steps. All test code is complete. All file paths are exact.

**Type consistency:** `broadcastSchemaUpdated` is exported from `events.ts` and imported in `columns.ts` — consistent. `haClient.getAllStates` and `loadHAEnv` are already exported from existing modules — consistent.

**Gaps found:** None in psyboard tasks. psyduck task (Task 5) needs OpenClaw skill format research.
