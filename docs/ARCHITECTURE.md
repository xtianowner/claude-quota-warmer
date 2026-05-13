# Architecture

Internal design of `claude-code-healthcheck`. Read this if you want to
hack on it, or if you want to understand exactly what runs at trigger
time.

## One-paragraph summary

A Python daemon binds to `127.0.0.1:8765`. It exposes a small REST
API and serves a React SPA on the same port. The daemon uses
APScheduler with one `DateTrigger` per pending schedule point. When a
point fires, the daemon spawns the configured CLI (`reclaude` /
`claude`) via `asyncio.create_subprocess_exec`, validates the output
against an expected marker, retries with exponential backoff on
failure, and records the result. State persists to a config JSON and
an append-only JSONL run log.

## Component diagram

```
                            ┌──────────────────┐
                            │ ~/Library/Launch │
                            │ Agents/...plist  │  (Linux: systemd user unit)
                            │  KeepAlive=true  │
                            └────────┬─────────┘
                                     │ launches + restarts on crash
                                     ▼
        ┌──────────────────────────────────────────────────────────┐
        │  daemon (python -m backend.main) on 127.0.0.1:8765       │
        │                                                          │
        │  ┌─────────────────────────────────────────────────────┐ │
        │  │  FastAPI app (backend/main.py)                      │ │
        │  │  - /api/status, /api/config, /api/schedule, ...     │ │
        │  │  - serves frontend/dist/* (SPA + assets)            │ │
        │  └──────────────────┬──────────────────────────────────┘ │
        │                     │                                    │
        │  ┌──────────────────▼──────────────────────────────────┐ │
        │  │  HealthcheckScheduler (backend/scheduler.py)        │ │
        │  │  - AsyncIOScheduler (APScheduler)                   │ │
        │  │  - one DateTrigger job per pending SchedulePoint    │ │
        │  │  - asyncio.Lock prevents concurrent runs            │ │
        │  └──────────────────┬──────────────────────────────────┘ │
        │                     │ on fire / manual trigger           │
        │  ┌──────────────────▼──────────────────────────────────┐ │
        │  │  runner.run_once (backend/runner.py)                │ │
        │  │  - asyncio.create_subprocess_exec(...)              │ │
        │  │  - validate exit_code == 0 AND marker in output     │ │
        │  │  - retry loop w/ configurable backoff               │ │
        │  └──────────────────┬──────────────────────────────────┘ │
        │                     │ spawns                             │
        └─────────────────────┼────────────────────────────────────┘
                              ▼
                   ┌──────────────────┐
                   │ reclaude / claude│ → Anthropic API
                   │   (CLI binary)   │
                   └──────────────────┘

                Persistence (backend/config.py, backend/storage.py)
                ├── data/config.json        (Config, full overwrite)
                └── data/runs.jsonl         (RunRecord, append-only)

                Frontend (frontend/src)
                ├── components/             (Background, StatusCard,
                │                            ScheduleCard, ConfigCard,
                │                            HistoryCard, ui primitives)
                ├── lib/datetime.ts         (countdown / ISO helpers)
                ├── i18n.tsx                (zh/en LocaleProvider)
                └── api.ts                  (fetch wrapper)
                Build: Vite → frontend/dist served by FastAPI.
```

## Data model

Defined in `backend/models.py` (Pydantic).

```python
SchedulePoint
  id: str                  # short uuid hex
  scheduled_at: str        # ISO 8601 with offset
  status: "pending" | "running" | "done" | "failed"
  run_id: Optional[str]    # links to RunRecord.id once executed
  note: Optional[str]      # human-readable reason on failure
  created_at: str

Config
  enabled: bool
  schedule_points: list[SchedulePoint]
  command: str                       # default "reclaude"
  extra_args: list[str]              # passed before "-p"
  prompt: str
  expected_marker: str
  timeout_seconds: int               # 10–600
  max_retries: int                   # 0–10
  retry_backoff_seconds: list[int]   # sleep before retry N

Attempt
  started_at / ended_at: str
  exit_code: int
  duration_ms: int
  output_tail: str                   # last ~2KB of combined stdout+stderr
  success: bool
  error: Optional[str]

RunRecord
  id: str
  trigger: "schedule" | "manual"
  point_id: Optional[str]
  started_at / ended_at: str
  status: "success" | "fail"         # final result across all attempts
  attempts: list[Attempt]
```

## Scheduling lifecycle

### Daemon startup (`HealthcheckScheduler.start`)

1. Start `AsyncIOScheduler`.
2. Load `Config` from `data/config.json` (or default if absent).
3. Iterate `schedule_points`: any with `status="pending"` and
   `scheduled_at < now` are marked `failed` with
   `note="missed: daemon was not running at the scheduled time"`.
   The window has already closed; we don't try to run them late.
4. Apply config: for each `pending` point still in the future,
   register an APScheduler `DateTrigger` job keyed `point-<id>`
   with `args=[point_id]`.
5. Restore `consecutive_successes` by walking `runs.jsonl` tail.

### Adding a point (`POST /api/schedule`)

1. Parse the user-supplied ISO datetime.
2. Generate a 12-hex-char id.
3. Append to `Config.schedule_points` and save.
4. Diff jobs vs config and add a `DateTrigger` job for the new point
   (only if `Config.enabled` is true).

### Removing a point (`DELETE /api/schedule/{id}`)

1. Drop the point from `Config.schedule_points`.
2. Save config.
3. Remove the corresponding APScheduler job if present.

### Master enable/disable

`POST /api/enable` / `POST /api/disable` flips `Config.enabled` and
re-applies the job set. Disabling removes all jobs (but keeps the
points so they re-arm when you enable again).

### Fire time (`HealthcheckScheduler._fire_point`)

When APScheduler calls back with `point_id`:

1. Re-load config, find the point. If gone or no longer `pending`,
   bail (idempotency).
2. Mark `point.status = "running"`, save config (so UI shows pulse).
3. Call `_execute(trigger="schedule", point=...)` which:
   a. Acquires the shared `asyncio.Lock` so only one run is in flight.
   b. Reloads config (might have been edited).
   c. Calls `run_once(cfg, trigger)`.
   d. Sets `record.point_id = point.id`.
   e. Appends `RunRecord` to `data/runs.jsonl`.
   f. Updates `consecutive_successes` (reset on fail).
4. Re-load config one more time and set
   `point.status = "done" | "failed"`, write `point.run_id`,
   set `point.note` if failed.
5. Save config.

The reason for multiple reload/save cycles is to keep config and run
log consistent even if the UI mutated config mid-flight (rare but
possible).

### Manual trigger (`POST /api/trigger`)

`_execute(trigger="manual", point=None)`. Same lock, runner,
persistence — but no point linkage. The dashboard's
**Trigger now** button uses this. Manual runs do not consume any
`schedule_points`.

## The runner (`backend/runner.py`)

`run_once(cfg, trigger) -> RunRecord` is the only place that spawns
external processes.

```python
for i in range(cfg.max_retries + 1):
    attempt = await _attempt_once(cfg)
    attempts.append(attempt)
    if attempt.success:
        break
    if i < max_attempts - 1:
        sleep = cfg.retry_backoff_seconds[min(i, len(...)-1)]
        await asyncio.sleep(sleep)
```

`_attempt_once`:

1. `shutil.which(cfg.command)` — resolves the binary on `PATH`. If
   missing, returns an `Attempt(success=False, exit_code=127,
   error="command not found...")` in ~1ms without spawning anything.
2. `asyncio.create_subprocess_exec(path, *extra_args, "-p", prompt,
   stdout=PIPE, stderr=STDOUT)`.
3. `asyncio.wait_for(proc.communicate(), timeout=...)`. On timeout,
   kills the process and returns an error attempt.
4. Decode output as UTF-8 (errors="replace"), check
   `exit_code == 0 and marker in output`.
5. Tail the output to the last 2KB so log files don't explode.

The runner is intentionally simple. It doesn't parse Claude's
response semantically; it only looks for a marker. This makes the
"success" check unambiguous and tampering-resistant: change the
marker and the success criterion changes.

## Persistence

### `data/config.json`
Whole-document overwrite (`json.dumps` → `pathlib.Path.write_text`)
inside a `threading.Lock`. Reads cached in memory after first load.

### `data/runs.jsonl`
Append-only. One JSON object per line. On every append, we
opportunistically truncate to the last 500 records if the file grows
past 750 lines.

This format makes it cheap to tail and easy to inspect manually
(`jq` will read it fine).

### Why not SQLite?
For ≤500 rows of run history and one config blob, JSON / JSONL is
simpler, debuggable by `cat`, and avoids the dependency. If the
workload outgrows this (it shouldn't), upgrade is straightforward.

## Frontend

Plain React 18 + Vite 5 + Tailwind 3. No state library; the dashboard
polls `/api/status` and `/api/runs?limit=30` every 5s, and ticks a
local `now` once per second for the countdown displays.

Styling tokens:
- Background: indigo-50 → fuchsia-50 → amber-50 linear gradient with
  three large blurred color blobs for depth.
- Cards: `bg-white/70 backdrop-blur-xl border-white/60 rounded-2xl
  shadow-glass` (custom shadow defined in `tailwind.config.js`).
- Typography: Inter for UI, JetBrains Mono for datetimes and code
  output. Loaded from Google Fonts.

Components are kept small and dumb: `App.tsx` owns all state and
passes data + callbacks down. There's no React Router (single page),
no context except the i18n `LocaleProvider`.

## Service registration

### macOS LaunchAgent

`scripts/install.sh` writes a plist that:
- Runs `${PROJECT_DIR}/.venv/bin/python -m backend.main --host ${HOST}
  --port ${PORT}`
- Sets `KeepAlive=true` so launchd restarts the daemon if it crashes
- Sets `RunAtLoad=true` so it starts on login
- Pre-pends `/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin` to
  `PATH` for the subprocess (LaunchAgents inherit a minimal PATH)
- Writes stdout/stderr to `data/logs/daemon.{out,err}.log`

`launchctl bootstrap gui/$(uid)` loads it. `launchctl bootout`
removes it.

### Linux systemd user unit

`scripts/install.sh` writes a `.service` file under
`~/.config/systemd/user/`, with `Restart=always` for crash recovery.
`systemctl --user enable --now` activates it.

## Concurrency and races

- Only one healthcheck runs at a time: `_run_lock = asyncio.Lock`.
  Concurrent triggers coalesce.
- All scheduler operations (add/remove/apply) happen on the
  asyncio event loop, so APScheduler's internal state isn't shared
  across threads.
- Config persistence is guarded by a `threading.Lock` (FastAPI
  endpoints can run in a threadpool for sync routes; safer to lock).

## Why interval scheduling was retired

See `LESSONS.md`. Short version: users want absolute moments
("tomorrow 05:30") rather than uniform heartbeats. The interval
model couldn't express "fire on the boundary of a specific window"
and led to either too few or too many requests depending on phase.
