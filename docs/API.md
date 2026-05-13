# API reference

REST API exposed by the daemon at `http://127.0.0.1:8765/api`.

OpenAPI / Swagger UI is auto-generated and live at:

> http://127.0.0.1:8765/docs

This document is a hand-written summary for convenience.

All endpoints accept and return JSON. Errors return standard HTTP
status codes with `{"detail": "..."}` bodies (FastAPI convention).

## GET /api/health

Liveness probe.

```json
{"ok": true}
```

## GET /api/status

Snapshot of runtime state. The dashboard polls this every 5s.

```json
{
  "enabled": true,
  "config": { /* full Config object — see PUT /api/config */ },
  "next_point": {
    "id": "1e0971888c13",
    "scheduled_at": "2026-05-14T05:30:00+08:00",
    "status": "pending",
    "source": "manual",
    "run_id": null,
    "note": null,
    "created_at": "2026-05-13T10:30:42+00:00"
  },
  "last_run": { /* RunRecord — see GET /api/runs */ },
  "consecutive_successes": 3,
  "running": false,
  "quota_snapshot": {
    "used_usd": 12.34,
    "quota_usd": 50.0,
    "resets_at_ms": 1747200000000,
    "enabled": true,
    "status": "active",
    "fetched_at": "2026-05-13T10:25:00+00:00"
  },
  "reclaude_error": null
}
```

- `next_point` — the earliest schedule point with `status="pending"`
  whose `scheduled_at` is in the future. `null` if no such point.
- `next_point.source` — `"manual"` (user-added) or `"auto"` (computed
  by the reclaude poll job).
- `last_run` — most recent `RunRecord` of any trigger source.
- `running` — `true` while a healthcheck is in flight.
- `quota_snapshot` — last successful `/api/app/billing/carpool-quota`
  response, or `null` if mode is manual or the poll has never succeeded.
- `reclaude_error` — `null` on success, otherwise one of
  `"not_configured" | "login_required" | "account_disabled" | "network"`.

## GET /api/config

Current configuration document.

```json
{
  "enabled": false,
  "schedule_points": [],
  "mode": "manual",
  "reclaude_email": null,
  "auto_offset_seconds": 30,
  "command": "reclaude",
  "extra_args": [],
  "prompt": "Claude Code healthcheck: 请只回复 HEALTHCHECK_OK",
  "expected_marker": "HEALTHCHECK_OK",
  "timeout_seconds": 120,
  "max_retries": 3,
  "retry_backoff_seconds": [30, 120, 300]
}
```

## PUT /api/config

Replace the entire configuration document. Request body is a full
`Config`. Returns the saved config.

Constraints (Pydantic-validated):

| Field | Type | Constraints |
|---|---|---|
| `enabled` | bool | — |
| `schedule_points` | list[SchedulePoint] | — (use the schedule endpoints instead) |
| `mode` | `"manual" \| "auto_reclaude"` | — |
| `reclaude_email` | string \| null | set by `/api/reclaude/login`, cleared by logout |
| `auto_offset_seconds` | int | 0 ≤ x ≤ 3600; default 30 |
| `command` | string | — |
| `extra_args` | list[string] | — |
| `prompt` | string | — |
| `expected_marker` | string | — |
| `timeout_seconds` | int | 10 ≤ x ≤ 600 |
| `max_retries` | int | 0 ≤ x ≤ 10 |
| `retry_backoff_seconds` | list[int ≥ 0] | — |

**Note**: while you *can* mutate `schedule_points` via this endpoint,
prefer the dedicated `/api/schedule` routes; they handle id
generation and ISO normalization.

Errors:
- `422 Unprocessable Entity` — validation failed.

## POST /api/enable

Sets `enabled=true` and re-registers APScheduler jobs for all
pending future points. Returns the new config.

## POST /api/disable

Sets `enabled=false` and removes all APScheduler jobs (schedule
points themselves are preserved). Returns the new config.

## POST /api/schedule

Add a single absolute trigger point.

Request:
```json
{ "scheduled_at": "2026-05-14T05:30:00+08:00" }
```

`scheduled_at` is parsed with `dateutil.parser.isoparse`. If no
timezone offset is present it is interpreted as UTC. The server
generates a 12-char hex id and appends a `SchedulePoint` to
`Config.schedule_points`.

Returns the updated `Config`.

Errors:
- `400 Bad Request` — datetime couldn't be parsed.

## DELETE /api/schedule/{point_id}

Remove the point with the given id. Removing a point that doesn't
exist is a no-op (still returns the current config).

Returns the updated `Config`.

## POST /api/trigger

Run one healthcheck immediately. Does not consume any
`schedule_points`. The run is recorded in history with
`trigger="manual"`.

This blocks until the run completes (success or all retries
exhausted). Use it sparingly from automation — for testing it's the
fastest feedback loop.

Returns the resulting `RunRecord`.

Errors:
- `409 Conflict` — another run is already in flight. Wait for it,
  then retry.

## POST /api/reclaude/login

Authenticate against `https://reclaude.ai`, store the resulting `rc_sid`
cookie and the password in `data/secrets.json`, set `config.mode` to
`auto_reclaude`, and queue an immediate poll.

Request:
```json
{ "email": "you@example.com", "password": "..." }
```

Response (`ReclaudeStatus`):
```json
{
  "has_password": true,
  "email": "you@example.com",
  "snapshot": { /* QuotaSnapshot — see GET /api/status */ },
  "error": null
}
```

Errors:
- `401 Unauthorized` — reclaude rejected the credentials.
- `400 Bad Request` — `AccountDisabled` (carpool not active for this account).
- `502 Bad Gateway` — reclaude.ai unreachable or returned an unexpected response.

## GET /api/reclaude/snapshot

Read-only view of the last `QuotaSnapshot` and current error code.

```json
{ "has_password": true, "email": "you@example.com", "snapshot": {...}, "error": null }
```

## POST /api/reclaude/refresh

Force a poll cycle now instead of waiting for the 10-minute tick.
Returns the same shape as `/api/reclaude/snapshot`.

## DELETE /api/reclaude/credentials

Clear `rc_sid` + password from `data/secrets.json`, set
`config.reclaude_email = null`, set `config.mode = "manual"`. Returns
the updated `Config`. Existing `source="auto"` points are preserved
on the schedule list (the daemon stops chaining new ones).

## GET /api/runs?limit=N

List recent run records, newest first.

```json
[
  {
    "id": "2026-05-13T02:46:04.963675+00:00",
    "trigger": "manual",
    "point_id": null,
    "started_at": "2026-05-13T02:46:04.963675+00:00",
    "ended_at": "2026-05-13T02:46:12.086285+00:00",
    "status": "success",
    "attempts": [
      {
        "started_at": "2026-05-13T02:46:04.963683+00:00",
        "ended_at": "2026-05-13T02:46:12.086110+00:00",
        "exit_code": 0,
        "duration_ms": 7122,
        "output_tail": "同步配置…\nHEALTHCHECK_OK\n",
        "success": true,
        "error": null
      }
    ]
  }
]
```

- `limit` — 1 ≤ x ≤ 500. Default 50.
- Records are persisted append-only in `data/runs.jsonl`; the daemon
  occasionally truncates to the last 500.
- `attempts` is in execution order. The final attempt determines the
  run's overall `status`.

## Curl recipes

```bash
BASE=http://127.0.0.1:8765

# health
curl -fsS $BASE/api/health

# show status
curl -fsS $BASE/api/status | jq

# add a point for tomorrow 05:30 in local tz
SCHED=$(python -c "import datetime as d; t=d.datetime.now(d.timezone.utc).astimezone()+d.timedelta(days=1); t=t.replace(hour=5,minute=30,second=0,microsecond=0); print(t.isoformat())")
curl -fsS -X POST -H "Content-Type: application/json" \
  -d "{\"scheduled_at\": \"$SCHED\"}" $BASE/api/schedule | jq

# enable scheduling
curl -fsS -X POST $BASE/api/enable | jq

# trigger one immediately (will take 5-10s of network/API time)
curl -fsS -X POST $BASE/api/trigger | jq '.status, .attempts[-1].duration_ms'

# tail run history
curl -fsS "$BASE/api/runs?limit=5" | jq '.[] | {status, ended_at, dur_ms: .attempts[-1].duration_ms}'
```
