# Home Assistant Integration — Design Spec

## Overview

A new `POST /api/home-assistant/check` endpoint that queries Home Assistant, evaluates alert rules from a config file, and creates tasks idempotently in the "Today" column.

## Config File

Location: `server/data/home-assistant.json`

Credentials: read from env vars `HOME_ASSISTANT_URL` and `HOME_ASSISTANT_TOKEN` at startup.

### Config Schema

```json
{
  "url": "http://10.0.0.229:8123",
  "tokenEnvVar": "HOME_ASSISTANT_TOKEN",
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
      "condition": {
        "type": "stateToTitle",
        "mapping": {
          "off": "Check litter robot: Off",
          "offline": "Check litter robot: Offline",
          "csf": "Check litter robot: Cat Sensor Fault",
          "df1": "Empty Absol's litter box (2 cycles left)",
          "df2": "Empty Absol's litter box (1 cycle left)",
          "dfs": "Empty Absol's litter box NOW! (full)",
          "dhf": "Check litter robot: Dump + Home Position Fault",
          "dpf": "Check litter robot: Dump Position Fault",
          "hpf": "Check litter robot: Home Position Fault",
          "otf": "Check litter robot: Over Torque Fault",
          "pd": "Check litter robot: Pinch Detect",
          "scf": "Check litter robot: Cat Sensor Fault At Startup",
          "sdf": "Empty litter robot: Drawer Full At Startup",
          "spf": "Check litter robot: Pinch Detect At Startup"
        }
      },
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

### Condition Types

| Type | Evaluates |
|------|-----------|
| `numericAbove` | `parseFloat(state) > threshold` |
| `numericBelow` | `parseFloat(state) < threshold` |
| `notEquals` | `state !== value` (string compare) |
| `isOn` | `state === "on"` |

### High vs Medium Priority

- `high` → `dueDate = today`, `doDate = today`
- `medium` → no date set (manual)

---

## Endpoint Behavior

```
POST /api/home-assistant/check
```

1. **Authenticate** — read HA token from env var; fail fast if missing
2. **Query HA** — `GET /api/states` with Bearer token; build entity map
3. **Evaluate alerts** — for each rule, check entity state against condition
4. **Idempotency check** — for each triggered alert, scan existing open tasks in "Today"; skip if task with same title already exists
5. **Create tasks** — one task per triggered alert using `POST /api/tasks`
6. **Return report**

### Response

```json
// 200 OK
{
  "created": ["Refill S7 water tank", "Refill S8 water tank"],
  "skipped": [],
  "alerts": [
    {
      "entityId": "binary_sensor.roborock_s7_maxv_water_shortage",
      "state": "on",
      "taskTitle": "Refill S7 water tank",
      "priority": "high",
      "action": "created"
    },
    {
      "entityId": "binary_sensor.s8_maxv_ultra_water_shortage",
      "state": "on",
      "taskTitle": "Refill S8 water tank",
      "priority": "high",
      "action": "created"
    }
  ]
}

// 500 — HA unreachable or auth failed
{ "error": "Home Assistant request failed: Connection refused" }
```

### Error Handling

- HA unreachable → 500 with descriptive error
- Missing env vars → 500 at startup
- Entity not found in HA response → skip that alert, log at debug level
- Task creation fails → include in error response, partial success possible

---

## File Structure

```
server/src/
  home-assistant/
    index.ts              # main endpoint handler
    config.ts             # load/parse home-assistant.json
    haClient.ts           # HA REST API calls
    alertEngine.ts        # evaluate conditions → triggered alerts
    taskCreator.ts        # idempotent task creation

server/data/
  home-assistant.json     # config file (user-created)
```

---

## Idempotency

A task is considered "already exists" if an open task in "Today" has an **exact title match**. Case-sensitive.

When a task is found: `action = "skipped"`, no task created.
When no task found: `action = "created"`, task is created.

---

## Config File Discovery

1. Try `server/data/home-assistant.json`
2. If missing → return 500 with `{ "error": "home-assistant.json not found" }`

---

## Bootstrapping the Config File

A companion script `server/scripts/bootstrap-ha-config.ts` (or .js) generates the initial `home-assistant.json` from a live HA query — listing all available entities so the user can pick which to add. This is a one-time setup tool, not run as part of the endpoint.

Alternatively, the config can be written manually based on this spec.

---

## Testing Strategy

1. **Unit tests** — `alertEngine.ts` with mocked HA entity states
2. **Integration tests** — `POST /api/home-assistant/check` with a mocked HA token/URL using `supertest`
3. **Idempotency tests** — run check twice, verify no duplicate tasks created
