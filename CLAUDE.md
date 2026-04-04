# psyboard — Local Personal Kanban Board

## Project Overview

A local-first Kanban board for personal task management. Runs entirely on your machine, no account, no cloud. Eventually integrates with Home Assistant (sensor-triggered tasks) and the psyduck agent (create/move/complete via chat).

**Current phase:** Phase 1 — Board + Drag-and-Drop

## Stack

- **Frontend:** Vite + React + TypeScript + @dnd-kit
- **Backend:** Node + Express + TypeScript
- **Storage:** `server/data/board.json` (JSON file)
- **Test:** Vitest (both client and server)
- **Monorepo:** `client/` and `server/` at root

## Commands

```bash
# Install dependencies
npm install
cd client && npm install
cd server && npm install

# Run (one terminal — root uses concurrently)
npm run dev          # runs both client + server
cd client && npm run dev   # client only (port 5173)
cd server && npm run dev   # server only (port 3001)

# Test
cd client && npm test      # Vitest — client unit tests
cd server && npm test       # Vitest — server unit tests
```

## Architecture

```
client/               # Vite + React + TypeScript
  src/
    components/       # React components
    __tests__/        # Vitest unit tests
server/
  src/
    index.ts         # Express app entry
    store/
      boardStore.ts  # JSON file read/write (atomic)
    routes/
      board.ts       # GET /api/board
      columns.ts     # POST/DELETE /api/columns
      tasks.ts       # POST/PATCH/DELETE /api/tasks
    __tests__/       # Vitest unit tests + supertest
  data/
    board.json       # Persistent storage (created on first run)
```

### API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/board` | Full board state |
| POST | `/api/columns` | Create column `{ title }` |
| DELETE | `/api/columns/:id` | Delete column + its tasks |
| POST | `/api/tasks` | Create task `{ title, columnId }` |
| PATCH | `/api/tasks/:id` | Partial update `{ title?, description?, columnId?, order? }` |
| DELETE | `/api/tasks/:id` | Delete task |

### Data Model

```typescript
type Column = { id: string; title: string; order: number }
type Task = { id: string; title: string; description?: string; columnId: string; order: number; createdAt: string; updatedAt: string }
type Board = { columns: Column[]; tasks: Task[] }
```

Default columns: Todo (order: 0), Today (order: 1), This Week (order: 2), Done (order: 3)

## Conventions

- **Frontend owns state.** Server is a thin persistence layer.
- **Vite proxy for API.** `vite.config.ts` proxies `/api` to `http://localhost:3001`. No CORS middleware needed in Express for development.
- **Atomic writes.** `boardStore` uses temp file + `fs.rename` to prevent corruption on crash.
- **Structured errors.** API returns `{ error: string }` body on 400/404/500.
- **Clean over clever.** Learning project — prioritize readability.
- **Tests inline.** 80%+ coverage target on server code.

## Testing

Vitest is configured in both `client/` and `server/`. Run tests with `npm test` in each.

## Phases

### Phase 1 — Board + Drag-and-Drop (current)
Kanban board with 4 default columns (Todo, Today, This Week, Done). Drag tasks within and between columns. JSON file persistence.

**In scope:** Monorepo scaffold, API endpoints, React UI, @dnd-kit DnD, Vitest tests
**Tech debt:** Vite proxy, concurrently at root, atomic writes, structured errors

### Phase 2 — Home Assistant Integration
HA sensors trigger task creation on the board.

**Design:**
- `POST /api/tasks` accepts sensor-triggered tasks (already in API spec)
- HA automation fires webhooks when thresholds are breached (e.g., litter box weight, roborock water level)
- Tasks created by sensors show a visual marker (e.g., sensor icon or different background)
- No board-side UI for HA config — HA handles its own automation rules

**Open questions:**
- What does a sensor-created task look like vs manually-created? (different visual treatment?)
- Does psyduck integration need auth, or is localhost-to-localhost trusted?

### Phase 3 — psyduck Agent Integration
psyduck agent controls the board via API.

**Design:**
- psyduck POSTs new tasks: `POST /api/tasks`
- psyduck moves tasks: `PATCH /api/tasks/:id` (updates columnId)
- psyduck completes tasks: `PATCH /api/tasks/:id` (moves to Done column)
- psyduck's daily list output → batch POST to board
- Natural language parsing happens in psyduck, not in the board API

**Note:** psyduck is an existing OpenClaw agent. The board just needs to expose the API that psyduck calls.

## Design Context

Full design doc: `~/.gstack/projects/shumanliu-michelle-psyboard/shumanliu-main-design-20260404.md`
Eng review test plan: `~/.gstack/projects/shumanliu-michelle-psyboard/shumanliu-main-eng-review-test-plan-20260404.md`

These files contain the full problem statement, architecture decisions, and test coverage requirements from the office-hours + eng-review sessions.

## What This Project Is NOT

- No auth
- No database
- No cloud deployment
- No accounts
- No real-time sync across devices (single-user, single-board)
