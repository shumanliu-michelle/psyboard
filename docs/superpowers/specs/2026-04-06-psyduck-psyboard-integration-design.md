# psyduck + psyboard Integration Design

## Overview

**Goal:** psyduck becomes the natural-language interface to psyboard. All task management flows through psyboard as the single source of truth. psyduck reads/writes via REST API and delivers reminders to Slack.

- **psyboard** owns all task data, recurrence, due dates, columns
- **psyduck** handles natural-language parsing, Slack delivery, and household domain knowledge
- **No duplicate state** — `HOUSEHOLD_STATE.md`, `APPOINTMENTS.md`, `HOME_ASSISTANT.md`, and `scripts/ha_state.py` have been deleted; their responsibilities now live in psyboard

---

## Section 1: psyboard API Changes

### 1.0 `GET /api/ha/sensors` — HA live sensor data (on-demand only)

Returns live sensor readings from Home Assistant. psyduck uses this **only when the user directly asks** about a specific HA device (e.g. "how full is the litter robot?", "any vacuum alerts?"). For scheduled reminders, HA alerts appear as psyboard tasks — queried via `psyboard_query`, not this endpoint.

```
GET /api/ha/sensors
Response: {
  "litterRobot": {
    "wasteDrawerPercent": number,       // 0-100, alert if >70%
    "hopperStatus": string,              // e.g. "enabled", "empty"
    "petWeight": number,                // lb
    "visitsToday": number
  },
  "vacuums": {
    "s8MaxvUltra": {
      "waterShortage": boolean,
      "dirtyWaterFull": boolean,
      "status": string                  // error state if abnormal
    },
    "s7Maxv": {
      "waterShortage": boolean,
      "status": string
    }
  },
  "timestamp": string                   // ISO datetime of reading
}
```

psyboard is the single integration point for HA. psyduck never calls HA directly — on-demand device queries go through `GET /api/ha/sensors`, and reminder-time alerts come through psyboard tasks created by psyboard's HA integration.

### 1.1 New `GET /api/schema` endpoint

Returns the board schema psyduck needs to construct API calls:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "kind": "system", "systemKey": "backlog" },
    { "id": "col-today", "title": "Today", "kind": "system", "systemKey": "today" },
    { "id": "col-done", "title": "Done", "kind": "system", "systemKey": "done" },
    { "id": "col-abc123", "title": "Shopping", "kind": "custom" },
    { "id": "col-def456", "title": "Appointments", "kind": "custom" }
  ],
  "taskFields": {
    "columnId": "string",
    "title": "string",
    "description": "string?",
    "doDate": "YYYY-MM-DD?",
    "dueDate": "YYYY-MM-DD?",
    "priority": "low | medium | high?",
    "assignee": "SL | KL?",
    "recurrence": "RecurrenceConfig?",
    "completedAt": "ISO datetime?"
  },
  "endpoints": {
    "getBoard": "GET /api/board",
    "getSchema": "GET /api/schema",
    "createColumn": "POST /api/columns { title, accent? }",
    "createTask": "POST /api/tasks { title, columnId, description?, doDate?, dueDate?, priority?, assignee?, recurrence? }",
    "updateTask": "PATCH /api/tasks/:id { title?, columnId?, doDate?, dueDate?, priority?, assignee?, recurrence?, completedAt? }",
    "deleteTask": "DELETE /api/tasks/:id",
    "reorderTask": "POST /api/tasks/reorder { taskId, targetColumnId, newIndex }"
  }
}
```

psyboard already has all columns and tasks. This endpoint assembles the schema from the existing board data.

### 1.2 SSE `schema_updated` event

When a column is created, updated, or deleted, the SSE `/api/events` stream broadcasts:

```
data: {"type":"schema_updated"}
```

Clients (including psyduck's main session) listen for this and refetch `GET /api/schema`.

---

## Section 2: psyduck Tool Definition

psyduck registers `psyboard` as an OpenClaw tool in its main session. The tool definition is built dynamically at session startup by fetching `GET /api/schema`.

### Tool: `psyboard_query`

**Purpose:** Query the psyboard Kanban app for tasks.

```
Tool: psyboard_query
Description: Query psyboard for tasks. Use when user wants to know what tasks exist, are due, are overdue, or match criteria. Handles task queries, list summaries, and deadline checks.
Parameters:
  - column (optional): Filter by column title or id, e.g. "Shopping", "Appointments", "Today"
  - dueBy (optional): YYYY-MM-DD — return tasks with dueDate <= this date
  - doBy (optional): YYYY-MM-DD — return tasks with doDate <= this date
  - assignee (optional): "SL" or "KL"
  - priority (optional): "high", "medium", or "low"
  - search (optional): free-text search against task title
  - includeDone (optional): if true, include tasks in Done column; default false
```

### Tool: `psyboard_create_task`

**Purpose:** Create a new task on psyboard.

```
Tool: psyboard_create_task
Description: Create a task on psyboard. Use when user asks to add, create, or capture a task or reminder.
Parameters:
  - title (required): task title
  - columnId (required): target column id (fetch from psyboard_schema first)
  - description (optional): free-text notes
  - doDate (optional): YYYY-MM-DD when user plans to work on it
  - dueDate (optional): YYYY-MM-DD deadline
  - priority (optional): "low" | "medium" | "high"
  - assignee (optional): "SL" | "KL"
  - recurrence (optional): recurrence rule object
    - kind: "daily" | "weekly" | "monthly" | "interval_days" | "weekdays" | "cron"
    - mode: "fixed" | "completion_based"
    - intervalDays (required if kind=interval_days): number
    - cronExpr (required if kind=cron): cron expression
```

### Tool: `psyboard_update_task`

**Purpose:** Update, move, or complete a task.

```
Tool: psyboard_update_task
Description: Update a task — change title, description, move to another column, set dates, priority, assignee, or mark complete. Use when user says "done", "completed", "move to X", "update task", "change due date".
Parameters:
  - taskId (required): the task id (from query results)
  - title (optional): new title
  - description (optional): new description
  - columnId (optional): move to different column (use column id, not title)
  - doDate (optional): YYYY-MM-DD
  - dueDate (optional): YYYY-MM-DD
  - priority (optional): "low" | "medium" | "high" | null (to clear)
  - assignee (optional): "SL" | "KL" | null (to clear)
  - completedAt (optional): set to ISO datetime to mark done; omit or null to un-complete
  - suppressNextOccurrence (optional): boolean — for recurring tasks, skip the next occurrence
```

### Tool: `psyboard_delete_task`

**Purpose:** Delete a task.

```
Tool: psyboard_delete_task
Description: Permanently delete a task. Use when user explicitly says "delete", "remove", "cancel" a task.
Parameters:
  - taskId (required): the task id
```

### Tool: `psyboard_create_column`

**Purpose:** Create a new column on the board.

```
Tool: psyboard_create_column
Description: Create a new column on psyboard. Use when user asks to create a new category/list that doesn't match existing columns, and confirms they want a new column.
Parameters:
  - title (required): column title, e.g. "Electronics", "Errands"
  - accent (optional): hex color code, e.g. "#ec4899"
```

### Tool: `psyboard_ha_sensors`

**Purpose:** On-demand query only — use when the user directly asks about a specific HA device status (e.g. "how full is the litter robot?", "any vacuum alerts?"). Not used in scheduled reminders — those pull HA alerts from psyboard tasks.

```
Tool: psyboard_ha_sensors
Description: Returns live Home Assistant sensor data — litter robot waste level, robot vacuum water/maintenance status, and other HA device states. Use ONLY for on-demand queries about specific devices.
```

### Tool: `psyboard_get_schema`

**Purpose:** Fetch the current board schema (columns and available fields). psyduck calls this at session startup and on `schema_updated` SSE events.

```
Tool: psyboard_get_schema
Description: Returns the board schema — all column ids and titles, task field definitions, and endpoint specs. Call this at session start and whenever the user references a column you haven't seen before.
```

---

## Section 3: psyduck Main Session Behavior

### Startup Sequence

1. Read `SOUL.md`, `USER.md`, `memory/YYYY-MM-DD.md` (today + yesterday), `MEMORY.md`
2. Fetch `GET /http://localhost:3001/api/schema` — build all psyboard tool definitions dynamically
3. Establish SSE connection to `GET /http://localhost:3001/api/events` — listen for `schema_updated`
4. On `schema_updated` event: refetch `GET /http://localhost:3001/api/schema` and rebuild tool definitions

### Task Inference Logic (creating tasks)

When user says "remind me to...", "add...", "I need to...", psyduck infers column:

| Signal | Inferred Column |
|--------|-----------------|
| "today", "morning", "this morning", "before work" | Today |
| "this week", "someday", "eventually", no time cue | Backlog |
| "appointment", "dentist", "vet", "doctor", "meeting" | Appointments (if column exists) |
| "shopping", "buy", "grocery", "pick up" | Shopping (if column exists) |
| Due date = today | Today |
| Due date = within 7 days | Today |

If the target column doesn't exist → `POST /api/columns` first → then create task.

After inference, psyduck confirms: "I'll add 'Fix fence' to Today. Sound right?" (Option B from earlier.)

### Completion Flow

When user says "done", "I finished", "completed":

1. Query psyboard for matching task
2. Confirm with user: "Shall I mark '[task]' as done?"
3. On yes: `PATCH /api/tasks/:id` with `completedAt` set
4. Done

### Interactive Query Examples

**"What do I have today?"**
→ `psyboard_query(dueBy=today)` → format as Slack message

**"What's on my shopping list?"**
→ `psyboard_query(column="Shopping")` → format as list

**"Anything due before bed?"**
→ `psyboard_query(dueBy=YYYY-MM-DD)` for today → filter to Today column tasks

**"What's overdue?"**
→ `psyboard_query(dueBy=today, includeDone=false)` → filter where dueDate < today

**"Show me high priority tasks"**
→ `psyboard_query(priority="high", includeDone=false)`

**"How full is the litter robot?" / "Any vacuum alerts?"**
→ `psyboard_ha_sensors` → format the relevant sensor values

---

## Section 4: Cron Job Updates

### `state-prep-household-morning` (7:30 AM)

**DEPRECATED — delete this cron job.** Its purpose was to update `HOUSEHOLD_STATE.md` with overdue cadence calculations. After migration to psyboard, all recurring task due dates are managed by psyboard's recurrence engine. No file-based state sync is needed.

### `Daily morning household reminder` (8 AM)

**Prompt update — the message to psyduck becomes:**

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
- Use psyboard_ha_sensors only for on-demand queries when user asks about a specific device
- Format tasks clearly: title, due date, priority, assignee
- Use natural household wording — not stiff task-manager phrasing
- Keep it short, structured, and easy to scan
- Omit sections with nothing to report
```

### `Daily evening household reminder` (9 PM)

**Prompt update — the message to psyduck becomes:**

```
Send an evening household reminder to Slack channel C0AN2T02SNQ.

**Format — include these sections if applicable:**
1. **Dishwasher** — remind to run before bed if not done (check if a "run dishwasher" or similar task is in Today and not completed)
2. **Pool pump** — remind to turn on if night temp ≤1°C
3. **Laundry follow-up** — check psyboard for any laundry-related tasks still in Today
4. **Tomorrow heads-up** — psyboard: tasks due tomorrow worth preparing tonight
5. **Any urgent tasks still pending** — psyboard: high-priority tasks still not in Done as of now

**Rules:**
- Check psyboard via psyboard_query for task completion status
- Keep the tone calm, structured, low-noise, and natural
- Omit sections with nothing to report
- If nothing relevant applies, send a minimal check-in or stay silent
```

---

## Section 5: psyduck File Structure (After Migration)

After this integration and the deletion of `HOUSEHOLD_STATE.md`, `APPOINTMENTS.md`, the psyduck workspace contains:

```
workspace-psyduck/
  SOUL.md              # Core identity and behavioral principles
  IDENTITY.md          # Name, emoji, creature type
  USER.md             # About Shuman and Kejie
  MEMORY.md           # Long-term memory: household knowledge, pet care, plant rules, preferences, guardrails
  memory/
    YYYY-MM-DD.md     # Daily session logs
```

### Migration checklist (files already deleted by user):

- `HOUSEHOLD_STATE.md` — DELETED ✓
- `APPOINTMENTS.md` — DELETED ✓
- `HOME_ASSISTANT.md` — DELETED ✓
- `scripts/ha_state.py` — DELETED ✓

Before deletion, these files were migrated as follows:
- Pet care rules (Lucario recipe, Absol care) → `MEMORY.md` ✓
- Plant watering rules/moisture scales → `MEMORY.md` ✓
- Gardener + billing → `MEMORY.md` household systems section ✓
- Location → `MEMORY.md` ✓
- Recurring task schedules → psyboard via `POST /api/tasks`
- Appointments → psyboard "Appointments" column via `POST /api/tasks`
- HA sensor access → `GET /api/ha/sensors` (psyboard handles HA directly)
- `HOUSEHOLD_SYSTEM.md` — DELETED ✓ (content merged into `MEMORY.md`)

---

## Section 6: psyboard Column Conventions

To support consistent psyduck behavior, the default board should have these columns:

| Column | ID | Purpose |
|--------|-----|---------|
| Backlog | `col-backlog` | Someday/maybe, no urgency |
| Today | `col-today` | Tasks to do today |
| Shopping | (custom) | Shopping list items |
| Appointments | (custom) | Calendar-like appointments |
| Done | `col-done` | Completed tasks |

Additional custom columns can be created as needed via `POST /api/columns`.

---

## Section 7: Open Questions / Future

- **Assignee in reminders:** When psyduck sends a morning summary, should it indicate which tasks belong to Shuman (SL) vs Kejie (KL)?
- **Recurring task completion-based rescheduling:** When a recurring task is marked done, psyboard advances the next due date. psyduck confirms "done" with user before marking complete — so this flow works naturally.
- **Slack message threading:** Should psyduck's board query responses thread off the original cron reminder, or post as new messages?
- **One-off favor tasks:** If user says "can you ask Kejie to pick up milk", this isn't a psyboard task — it's a coordination ask. This stays in psyduck's conversational domain, not board.
- **HA on-demand vs reminder scope:** `psyboard_ha_sensors` is for direct queries only. If you want HA alerts in morning/evening reminders, psyboard's HA integration should create tasks on the board when thresholds are breached, and those tasks appear via `psyboard_query`. Currently the spec reflects this design.

---

## Appendix: psyboard API Reference for psyduck

```
Base URL: http://localhost:3001 (for local development)

GET  /api/board           — Full board (all columns + all tasks)
GET  /api/schema          — Board schema (columns, fields, endpoints)
GET  /api/events          — SSE stream (board_updated, schema_updated events)
GET  /api/ha/sensors      — Live HA sensor data (litter robot, vacuums)
POST /api/columns         — Create column { title, accent? }
POST /api/tasks           — Create task { title, columnId, description?, doDate?, dueDate?, priority?, assignee?, recurrence? }
PATCH /api/tasks/:id      — Update task { title?, columnId?, doDate?, dueDate?, priority?, assignee?, recurrence?, completedAt? }
DELETE /api/tasks/:id     — Delete task
POST /api/tasks/reorder   — Reorder task { taskId, targetColumnId, newIndex }
```
