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
Use for: loading the complete board (all columns + all active tasks). Done tasks are filtered to the last 7 days by default.

```
exec curl -s http://localhost:3001/api/board | jq '.tasks'
```

### `GET /api/tasks` — Targeted Task Queries
Use for: answering specific questions about tasks (due today, tomorrow, high priority, etc.). Returns `{ tasks: [...], hasMore: boolean }` — only the matching tasks.

**Query params format:** `field=operator:value`
- Operators: `eq` (equals, default), `ne` (not equals), `gte` (on or after), `gt` (after), `lte` (on or before), `lt` (before), `cont` (contains, case-insensitive)
- For bare `field=value`, defaults to `eq` operator
- `limit=N` — max results (default 50, max 200)
- `offset=N` — pagination offset
- `sortBy=dueDate|doDate|completedAt|order|priority|createdAt`
- `sortDir=asc|desc`

**Common queries:**

What's on my plate today (tasks due today, not done):
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

Tasks assigned to KL:
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&assignee=eq:KL" | jq '.tasks'
```

Tasks containing keyword (e.g. "vacuum"):
```
exec curl -s "http://localhost:3001/api/tasks?title=cont:vacuum" | jq '.tasks'
```

Tasks in a specific column (e.g. Today):
```
exec curl -s "http://localhost:3001/api/tasks?columnId=eq:col-today" | jq '.tasks'
```

Load older Done tasks (pagination — most recent first):
```
# Replace <OLDEST_COMPLETED_AT> with the completedAt of the oldest currently visible Done task (ISO format)
exec curl -s "http://localhost:3001/api/tasks?columnId=eq:col-done&completedAt=lt:<OLDEST_COMPLETED_AT>" | jq '.tasks'
```

Tasks do-date today or past due (things to work on today):
```
exec curl -s "http://localhost:3001/api/tasks?columnId=ne:col-done&doDate=lte:2026-04-07" | jq '.tasks'
```

**Response format:**
```json
{ "tasks": [...], "hasMore": false }
```

If `hasMore` is true, there are more results beyond the current page. Use `limit` and `offset` to page through.

## Create Task

```
exec curl -s -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-Source: psyduck" \
  -d '{"title": "Task title", "columnId": "col-todo", "description": "Optional description", "dueDate": "2026-04-10"}'
```

Response includes the created task with id.

## Update Task

Partial update — only include fields to change:

```
exec curl -s -X PATCH http://localhost:3001/api/tasks/:id \
  -H "Content-Type: application/json" \
  -H "X-Source: psyduck" \
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
exec curl -s -X DELETE http://localhost:3001/api/tasks/:id \
  -H "X-Source: psyduck"
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

Returns all HA entity states. Use ONLY when user asks directly.

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
     -H "X-Source: psyduck" \
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

- All timestamps in ISO 8601 format (e.g., `2026-04-07T10:00:00Z`)
- Task ids are strings (e.g., `task-abc123`)
- Order fields determine sort position within columns (lower = higher in list)
- The board API runs on port 3001 by default
- Due dates are local dates (YYYY-MM-DD format)
- For recurring tasks: the next occurrence's dueDate/doDate reflects the calculated next date, not the original recurring task's date

## SSE Broadcast Source — REQUIRED HEADER

**CRITICAL:** Every POST/PATCH/DELETE API call MUST include the `X-Source: psyduck` header. Without it, the server broadcasts `source: "tab"` instead of `source: "psyduck"`, and browser clients cannot distinguish agent changes from tab changes.

All API mutations (create, update, move, complete, delete tasks):

```
exec curl -s -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -H "X-Source: psyduck" \
  -d '{"title": "...", "columnId": "col-today"}'
```

```
exec curl -s -X PATCH http://localhost:3001/api/tasks/:id \
  -H "Content-Type: application/json" \
  -H "X-Source: psyduck" \
  -d '{"columnId": "col-done", "completedAt": "2026-04-07T10:00:00Z"}'
```

```
exec curl -s -X DELETE http://localhost:3001/api/tasks/:id \
  -H "X-Source: psyduck"
```

GET requests (board, tasks, schema) do not need the header — only mutations.
