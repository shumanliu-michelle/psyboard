# Home Assistant Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/home-assistant/check` endpoint that queries Home Assistant, evaluates alert rules from a config file, and idempotently creates tasks in the "Today" column.

**Architecture:** The HA integration is a standalone module (`server/src/home-assistant/`) with clean separation: `config.ts` loads the config, `haClient.ts` makes HTTP calls to HA, `alertEngine.ts` evaluates conditions, `taskCreator.ts` creates tasks idempotently, and `index.ts` orchestrates and exposes the Express route.

**Tech Stack:** Node.js, Express, TypeScript, Vitest, supertest. Node native `fetch` for HA API calls (available in Node 18+).

---

## File Structure

```
server/
  config/
    ha/
      .env                      # gitignored — HOME_ASSISTANT_URL + HOME_ASSISTANT_TOKEN
      home-assistant.json       # gitignored — alert rules config
  src/
    home-assistant/
      config.ts                # load .env + home-assistant.json
      haClient.ts               # HA REST API client (getAllStates)
      alertEngine.ts            # evaluate conditions against entity states
      taskCreator.ts            # idempotent task creation in Today column
      index.ts                  # POST /api/home-assistant/check handler
  src/
    index.ts                   # register homeAssistantRouter under /api/home-assistant

server/data/
  board.json                   # (already exists, not modified)
```

---

## Task 1: Update .gitignore

**File:**
- Modify: `.gitignore`

- [ ] **Step 1: Add gitignore entries for HA config**

Add the following lines to `.gitignore` before the `## psyboard — generated data` section:

```
# Home Assistant config (contains credentials)
server/config/ha/
```

---

## Task 2: Create HA config directory and template files

**Files:**
- Create: `server/config/ha/.env`
- Create: `server/config/ha/home-assistant.json`

- [ ] **Step 1: Create the `server/config/ha/` directory and `.env` template**

Create `server/config/ha/.env` with:
```
HOME_ASSISTANT_URL=http://10.0.0.229:8123
HOME_ASSISTANT_TOKEN=
```

- [ ] **Step 2: Create `home-assistant.json` with all agreed alert rules**

Create `server/config/ha/home-assistant.json`:
```json
{
  "defaultColumn": "Today",
  "alerts": [
    {
      "entityId": "sensor.absol_waste_drawer",
      "condition": { "type": "numericAbove", "threshold": 80 },
      "taskTitle": "Empty Absol's litter box",
      "priority": "high"
    },
    {
      "entityId": "sensor.absol_hopper_status",
      "condition": { "type": "notEquals", "value": "enabled" },
      "taskTitle": "Check Absol's hopper",
      "priority": "medium"
    },
    {
      "entityId": "sensor.absol_litter_level",
      "condition": { "type": "numericBelow", "threshold": 80 },
      "taskTitle": "Refill Absol's litter",
      "priority": "high"
    },
    {
      "entityId": "sensor.absol_status_code",
      "condition": { "type": "notEquals", "value": "rdy" },
      "taskTitle": "Check Absol's status",
      "priority": "high"
    },
    {
      "entityId": "binary_sensor.roborock_s7_maxv_water_shortage",
      "condition": { "type": "isOn" },
      "taskTitle": "Refill S7 water tank",
      "priority": "high"
    },
    {
      "entityId": "binary_sensor.s8_maxv_ultra_water_shortage",
      "condition": { "type": "isOn" },
      "taskTitle": "Refill S8 water tank",
      "priority": "high"
    },
    {
      "entityId": "sensor.front_doorbell_battery",
      "condition": { "type": "numericBelow", "threshold": 10 },
      "taskTitle": "Charge front doorbell battery",
      "priority": "high"
    },
    {
      "entityId": "update.oura_ring_update",
      "condition": { "type": "isOn" },
      "taskTitle": "Update Oura ring firmware",
      "priority": "medium"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore server/config/ha/
git commit -m "feat: add HA config directory with .env template and alert rules

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Write haClient.ts

**File:**
- Create: `server/src/home-assistant/haClient.ts`

```typescript
// Types for HA API response
export type HAEntity = {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
}

export type HAClientConfig = {
  url: string      // e.g. "http://10.0.0.229:8123"
  token: string
}

/**
 * Fetch all states from Home Assistant.
 * Throws if HA is unreachable or auth fails.
 */
export async function getAllStates(config: HAClientConfig): Promise<HAEntity[]> {
  const url = `${config.url}/api/states`
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Home Assistant request failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<HAEntity[]>
}
```

- [ ] **Step 1: Create `server/src/home-assistant/haClient.ts`** with the code above.

- [ ] **Step 2: Commit**

```bash
git add server/src/home-assistant/haClient.ts
git commit -m "feat(ha): add HA REST API client

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Write alertEngine.ts

**File:**
- Create: `server/src/home-assistant/alertEngine.ts`

```typescript
import type { HAEntity } from './haClient.js'

export type AlertCondition =
  | { type: 'numericAbove'; threshold: number }
  | { type: 'numericBelow'; threshold: number }
  | { type: 'notEquals'; value: string }
  | { type: 'isOn' }

export type AlertRule = {
  entityId: string
  condition: AlertCondition
  taskTitle: string
  priority: 'high' | 'medium'
}

export type TriggeredAlert = {
  entityId: string
  state: string
  taskTitle: string
  priority: 'high' | 'medium'
}

/**
 * Evaluate all alert rules against a map of entity states.
 * Returns only the alerts whose conditions are met.
 */
export function evaluateAlerts(
  rules: AlertRule[],
  entityMap: Map<string, HAEntity>
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = []

  for (const rule of rules) {
    const entity = entityMap.get(rule.entityId)
    if (!entity) continue // entity not found in HA — skip silently

    if (evaluateCondition(rule.condition, entity.state)) {
      triggered.push({
        entityId: rule.entityId,
        state: entity.state,
        taskTitle: rule.taskTitle,
        priority: rule.priority,
      })
    }
  }

  return triggered
}

function evaluateCondition(condition: AlertCondition, state: string): boolean {
  switch (condition.type) {
    case 'numericAbove':
      return parseFloat(state) > condition.threshold
    case 'numericBelow':
      return parseFloat(state) < condition.threshold
    case 'notEquals':
      return state !== condition.value
    case 'isOn':
      return state === 'on'
  }
}
```

- [ ] **Step 1: Create `server/src/home-assistant/alertEngine.ts`** with the code above.

- [ ] **Step 2: Commit**

```bash
git add server/src/home-assistant/alertEngine.ts
git commit -m "feat(ha): add alert engine for evaluating HA entity conditions

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Write taskCreator.ts

**File:**
- Create: `server/src/home-assistant/taskCreator.ts`

```typescript
import { readBoard, createTask } from '../store/boardStore.js'
import { TODAY_COLUMN_ID } from '../types.js'
import type { TriggeredAlert } from './alertEngine.js'

function todayString(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export type TaskCreationResult = {
  alert: TriggeredAlert
  action: 'created' | 'skipped'
}

/**
 * Idempotent task creation: for each triggered alert, check if an open task
 * in the Today column already has the same title. If not, create it.
 */
export function createTasksForAlerts(alerts: TriggeredAlert[]): TaskCreationResult[] {
  const board = readBoard()
  const todayTasks = board.tasks.filter(t => t.columnId === TODAY_COLUMN_ID)

  const results: TaskCreationResult[] = []

  for (const alert of alerts) {
    const exists = todayTasks.some(t => t.title === alert.taskTitle)
    if (exists) {
      results.push({ alert, action: 'skipped' })
    } else {
      // high priority → doDate + dueDate = today; medium → no dates
      const doDate = alert.priority === 'high' ? todayString() : undefined
      const dueDate = alert.priority === 'high' ? todayString() : undefined

      createTask(alert.taskTitle, TODAY_COLUMN_ID, undefined, doDate, dueDate, alert.priority)
      results.push({ alert, action: 'created' })
    }
  }

  return results
}
```

- [ ] **Step 1: Create `server/src/home-assistant/taskCreator.ts`** with the code above.

- [ ] **Step 2: Commit**

```bash
git add server/src/home-assistant/taskCreator.ts
git commit -m "feat(ha): add idempotent task creator for HA alerts

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Write config.ts

**File:**
- Create: `server/src/home-assistant/config.ts`

```typescript
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type { AlertRule } from './alertEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'ha')
const ENV_FILE = path.join(CONFIG_DIR, '.env')
const JSON_FILE = path.join(CONFIG_DIR, 'home-assistant.json')

export type HAConfig = {
  defaultColumn: string
  alerts: AlertRule[]
}

type EnvVars = {
  HOME_ASSISTANT_URL: string
  HOME_ASSISTANT_TOKEN: string
}

function loadEnv(): EnvVars {
  const env: EnvVars = { HOME_ASSISTANT_URL: '', HOME_ASSISTANT_TOKEN: '' }
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`HA .env file not found at ${ENV_FILE}`)
  }
  const lines = fs.readFileSync(ENV_FILE, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    if (key === 'HOME_ASSISTANT_URL' || key === 'HOME_ASSISTANT_TOKEN') {
      ;(env as Record<string, string>)[key] = value
    }
  }
  if (!env.HOME_ASSISTANT_URL || !env.HOME_ASSISTANT_TOKEN) {
    throw new Error('HOME_ASSISTANT_URL or HOME_ASSISTANT_TOKEN is missing in .env')
  }
  return env
}

export type LoadedConfig = ReturnType<typeof loadEnv>

let _cachedEnv: LoadedConfig | null = null
let _cachedHAConfig: HAConfig | null = null

export function loadHAEnv(): LoadedConfig {
  if (_cachedEnv) return _cachedEnv
  _cachedEnv = loadEnv()
  return _cachedEnv
}

export function loadHAConfig(): HAConfig {
  if (_cachedHAConfig) return _cachedHAConfig
  if (!fs.existsSync(JSON_FILE)) {
    throw new Error(`home-assistant.json not found at ${JSON_FILE}`)
  }
  const raw = fs.readFileSync(JSON_FILE, 'utf-8')
  const parsed = JSON.parse(raw) as HAConfig
  if (!parsed.alerts || !Array.isArray(parsed.alerts)) {
    throw new Error('home-assistant.json must contain an "alerts" array')
  }
  _cachedHAConfig = parsed
  return _cachedHAConfig
}
```

- [ ] **Step 1: Create `server/src/home-assistant/config.ts`** with the code above.

- [ ] **Step 2: Commit**

```bash
git add server/src/home-assistant/config.ts
git commit -m "feat(ha): add config loader for .env and home-assistant.json

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Write home-assistant/index.ts (main handler)

**File:**
- Create: `server/src/home-assistant/index.ts`

```typescript
import { Router } from 'express'
import { loadHAEnv, loadHAConfig } from './config.js'
import { getAllStates } from './haClient.js'
import { evaluateAlerts } from './alertEngine.js'
import { createTasksForAlerts } from './taskCreator.js'

const router = Router()

router.post('/check', async (_req, res) => {
  let env: ReturnType<typeof loadHAEnv>
  let config: ReturnType<typeof loadHAConfig>

  try {
    env = loadHAEnv()
    config = loadHAConfig()
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    return
  }

  let entities: ReturnType<typeof getAllStates> extends Promise<infer T> ? T : never
  try {
    entities = await getAllStates({ url: env.HOME_ASSISTANT_URL, token: env.HOME_ASSISTANT_TOKEN })
  } catch (err) {
    res.status(500).json({ error: `Home Assistant request failed: ${(err as Error).message}` })
    return
  }

  // Build entity map
  const entityMap = new Map<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>()
  for (const entity of entities) {
    entityMap.set(entity.entity_id, entity)
  }

  const triggered = evaluateAlerts(config.alerts, entityMap)
  const results = createTasksForAlerts(triggered)

  const created = results.filter(r => r.action === 'created').map(r => r.alert.taskTitle)
  const skipped = results.filter(r => r.action === 'skipped').map(r => r.alert.taskTitle)

  res.json({ created, skipped, alerts: results.map(r => ({ ...r.alert, action: r.action })) })
})

export default router
```

- [ ] **Step 1: Create `server/src/home-assistant/index.ts`** with the code above.

- [ ] **Step 2: Commit**

```bash
git add server/src/home-assistant/index.ts
git commit -m "feat(ha): add POST /api/home-assistant/check endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Register the route in index.ts

**File:**
- Modify: `server/src/index.ts`

Add the import and route registration:

After line 4 (`import tasksRouter from './routes/tasks.js'`), add:
```typescript
import homeAssistantRouter from './home-assistant/index.js'
```

After line 14 (`app.use('/api/tasks', tasksRouter)`), add:
```typescript
app.use('/api/home-assistant', homeAssistantRouter)
```

- [ ] **Step 1: Edit `server/src/index.ts`** to register the route.

- [ ] **Step 2: Commit**

```bash
git add server/src/index.ts
git commit -m "feat(ha): register /api/home-assistant route

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Write alertEngine unit tests

**File:**
- Create: `server/src/__tests__/alertEngine.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { evaluateAlerts, type AlertRule, type HAEntity } from '../home-assistant/alertEngine.js'

const makeEntity = (entityId: string, state: string): HAEntity => ({
  entity_id: entityId,
  state,
  attributes: {},
})

const rules: AlertRule[] = [
  { entityId: 'sensor.absol_waste_drawer', condition: { type: 'numericAbove', threshold: 80 }, taskTitle: "Empty Absol's litter box", priority: 'high' },
  { entityId: 'sensor.absol_hopper_status', condition: { type: 'notEquals', value: 'enabled' }, taskTitle: "Check Absol's hopper", priority: 'medium' },
  { entityId: 'binary_sensor.roborock_s7_maxv_water_shortage', condition: { type: 'isOn' }, taskTitle: 'Refill S7 water tank', priority: 'high' },
  { entityId: 'sensor.front_doorbell_battery', condition: { type: 'numericBelow', threshold: 10 }, taskTitle: 'Charge front doorbell battery', priority: 'high' },
]

describe('evaluateAlerts', () => {
  it('triggers numericAbove when state exceeds threshold', () => {
    const entities = [makeEntity('sensor.absol_waste_drawer', '85')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe("Empty Absol's litter box")
  })

  it('does not trigger numericAbove when state is below threshold', () => {
    const entities = [makeEntity('sensor.absol_waste_drawer', '60')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers isOn when binary sensor is on', () => {
    const entities = [makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'on')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe('Refill S7 water tank')
  })

  it('does not trigger isOn when binary sensor is off', () => {
    const entities = [makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'off')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers notEquals when state differs', () => {
    const entities = [makeEntity('sensor.absol_hopper_status', 'empty')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe("Check Absol's hopper")
  })

  it('does not trigger notEquals when state matches', () => {
    const entities = [makeEntity('sensor.absol_hopper_status', 'enabled')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('triggers numericBelow when state is below threshold', () => {
    const entities = [makeEntity('sensor.front_doorbell_battery', '8')]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].taskTitle).toBe('Charge front doorbell battery')
  })

  it('does not trigger for unknown entity', () => {
    const entities: HAEntity[] = []
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(0)
  })

  it('returns multiple triggered alerts', () => {
    const entities = [
      makeEntity('sensor.absol_waste_drawer', '85'),
      makeEntity('binary_sensor.roborock_s7_maxv_water_shortage', 'on'),
    ]
    const map = new Map(entities.map(e => [e.entity_id, e]))
    const triggered = evaluateAlerts(rules, map)
    expect(triggered).toHaveLength(2)
  })
})
```

- [ ] **Step 1: Create `server/src/__tests__/alertEngine.test.ts`** with the tests above.

- [ ] **Step 2: Run tests**

```bash
cd server && npm test -- --run src/__tests__/alertEngine.test.ts
```
Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/alertEngine.test.ts
git commit -m "test(ha): add alertEngine unit tests

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Write integration test for POST /api/home-assistant/check

**File:**
- Create: `server/src/__tests__/homeAssistant.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { app } from '../index.js'
import { TODAY_COLUMN_ID, BACKLOG_COLUMN_ID, DONE_COLUMN_ID } from '../types.js'
import { writeBoard } from '../store/boardStore.js'
import type { Board } from '../types.js'

// Mock the config and HA client
vi.mock('../home-assistant/config.js', () => ({
  loadHAEnv: () => ({ HOME_ASSISTANT_URL: 'http://localhost:8123', HOME_ASSISTANT_TOKEN: 'test-token' }),
  loadHAConfig: () => ({
    defaultColumn: 'Today',
    alerts: [
      { entityId: 'binary_sensor.s8_maxv_ultra_water_shortage', condition: { type: 'isOn' }, taskTitle: 'Refill S8 water tank', priority: 'high' },
    ],
  }),
}))

vi.mock('../home-assistant/haClient.js', () => ({
  getAllStates: async () => [
    { entity_id: 'binary_sensor.s8_maxv_ultra_water_shortage', state: 'on', attributes: {} },
    { entity_id: 'binary_sensor.roborock_s7_maxv_water_shortage', state: 'off', attributes: {} },
  ],
}))

describe('POST /api/home-assistant/check', () => {
  beforeEach(() => {
    const board: Board = {
      columns: [
        { id: BACKLOG_COLUMN_ID, title: 'Backlog', kind: 'system', systemKey: 'backlog', position: 0, createdAt: '', updatedAt: '' },
        { id: TODAY_COLUMN_ID, title: 'Today', kind: 'system', systemKey: 'today', position: 1, createdAt: '', updatedAt: '' },
        { id: DONE_COLUMN_ID, title: 'Done', kind: 'system', systemKey: 'done', position: 2, createdAt: '', updatedAt: '' },
      ],
      tasks: [],
    }
    writeBoard(board)
  })

  it('creates a task when alert condition is met', async () => {
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(200)
    expect(res.body.created).toContain('Refill S8 water tank')
    expect(res.body.skipped).toHaveLength(0)
    expect(res.body.alerts).toHaveLength(1)
    expect(res.body.alerts[0].action).toBe('created')
  })

  it('idempotently skips creating a task if it already exists in Today', async () => {
    // First call
    await request(app).post('/api/home-assistant/check')
    // Second call
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(200)
    expect(res.body.created).toHaveLength(0)
    expect(res.body.skipped).toContain('Refill S8 water tank')
  })

  it('returns 500 when HA env is missing', async () => {
    vi.resetModules()
    vi.doMock('../home-assistant/config.js', () => ({
      loadHAEnv: () => { throw new Error('HOME_ASSISTANT_TOKEN is missing in .env') },
    }))
    const res = await request(app).post('/api/home-assistant/check')
    expect(res.status).toBe(500)
    expect(res.body.error).toContain('HOME_ASSISTANT_TOKEN')
  })
})
```

- [ ] **Step 1: Create `server/src/__tests__/homeAssistant.test.ts`** with the tests above.

- [ ] **Step 2: Run tests**

```bash
cd server && npm test -- --run src/__tests__/homeAssistant.test.ts
```
Expected: all 3 tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/src/__tests__/homeAssistant.test.ts
git commit -m "test(ha): add integration tests for POST /api/home-assistant/check

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

- [ ] All 8 alert rules from the spec are represented in `home-assistant.json`
- [ ] `numericAbove`, `numericBelow`, `notEquals`, `isOn` condition types all implemented
- [ ] High-priority alerts set `doDate = dueDate = today`; medium-priority alerts leave dates unset
- [ ] Idempotency: exact title match in "Today" column prevents duplicates
- [ ] All new files use `.js` extension in imports (ES modules, matching existing pattern)
- [ ] `server/config/ha/` added to `.gitignore`
- [ ] Tests cover: numericAbove, numericBelow, notEquals, isOn, entity not found, idempotency, error handling
- [ ] Each task commits atomically with a clear message
