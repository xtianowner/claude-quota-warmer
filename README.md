# claude-code-healthcheck

> Keep your Claude Code 5-hour quota window warm by firing one real request on a schedule.

A tiny daemon + web UI that periodically sends a real request to the `claude` (or `reclaude`) CLI, verifies the response, and retries on failure — so the rolling 5h quota window never lapses unused.

- **Backend**: FastAPI + APScheduler, async
- **Frontend**: React + Vite + Tailwind, single page
- **Daemon**: lives in `127.0.0.1:8765`; the OS service (launchd on macOS, systemd user unit on Linux) just keeps it alive
- **Retry-to-success**: each scheduled fire tries up to `max_retries + 1` times with configurable backoff before recording a failure
- **i18n**: 中文 / English
- **MIT licensed**

## Why

Claude Code's plan grants quota in rolling 5-hour windows. If you skip a window entirely, you can't "save up" the unused quota — it's just gone. This tool fires a single tiny request inside each window so the window stays counted as used.

> The request itself **does** consume a small amount of quota. The point is that one cheap healthcheck per window > forfeiting the whole window.

## Quick start

Requires Python ≥ 3.10 and Node.js ≥ 18 (for the UI build). The CLI you want to keep alive (`claude` or `reclaude`) must already be installed and authenticated.

```bash
git clone https://github.com/<your-user>/claude-code-healthcheck.git
cd claude-code-healthcheck

# One-shot install: creates .venv, installs deps, builds UI, registers the OS service
./scripts/install.sh
```

Then open: <http://127.0.0.1:8765>

1. Set the trigger interval (default **4h 50m** — comfortably inside the 5h window)
2. Confirm the command (`reclaude` or `claude`)
3. Click **Enable schedule**

That's it. The daemon will fire one healthcheck per interval. If the call fails (network blip, auth expired, etc.) it retries with exponential backoff until the budget is exhausted.

### Uninstall

```bash
./scripts/uninstall.sh
```

Leaves `./data/` (config + run history) intact. Delete the project directory to fully remove.

### Customize the service label

```bash
HEALTHCHECK_LABEL=com.acme.claude-keepalive \
HEALTHCHECK_PORT=8765 \
./scripts/install.sh
```

## How it works

```
            ┌───────────────────────────────┐
launchd ───>│  python -m backend.main       │   serves UI + API on
(systemd)   │  ├── APScheduler (interval)   │   127.0.0.1:8765
            │  └── runs `reclaude -p ...`   │
            │      verifies HEALTHCHECK_OK  │
            └───────────────────────────────┘
                      │
                      └─> data/config.json  (user-editable via UI)
                          data/runs.jsonl   (append-only run log)
```

Each scheduled fire spawns the configured command, captures stdout+stderr, and checks:

1. `exit_code == 0`
2. `expected_marker` is present in the output (default: `HEALTHCHECK_OK`)

If either fails, the runner sleeps for `retry_backoff_seconds[i]` and tries again, up to `max_retries + 1` attempts total. The full attempt history is persisted.

## Configuration

All fields are editable in the UI. Persisted to `data/config.json`:

| Field | Default | Notes |
|---|---|---|
| `enabled` | `false` | Master on/off |
| `interval_seconds` | `17400` (4h 50m) | Must be < 5h to keep window warm |
| `command` | `reclaude` | Or `claude` for the vanilla CLI |
| `extra_args` | `[]` | Inserted before `-p` |
| `prompt` | `Claude Code healthcheck: 请只回复 HEALTHCHECK_OK` | Sent via `-p` |
| `expected_marker` | `HEALTHCHECK_OK` | Substring check on output |
| `timeout_seconds` | `120` | Per attempt |
| `max_retries` | `3` | Attempts after the initial = 4 max |
| `retry_backoff_seconds` | `[30, 120, 300]` | Sleep before retry N |

## API

REST API at `http://127.0.0.1:8765/api`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | Snapshot: enabled, next_run_at, last_run, streak |
| `GET` | `/api/config` | Current config |
| `PUT` | `/api/config` | Replace config (full document) |
| `POST` | `/api/enable` / `/api/disable` | Toggle scheduling |
| `POST` | `/api/trigger` | Run one healthcheck immediately |
| `GET` | `/api/runs?limit=50` | Recent run records |

Auto-generated OpenAPI docs at `/docs`.

## Development

```bash
./scripts/dev.sh
# backend hot-reload on :8765, vite dev on :5173 (proxies /api -> :8765)
```

Open <http://127.0.0.1:5173>.

## Project layout

```
backend/        FastAPI app, scheduler, runner, storage
frontend/       Vite + React + Tailwind single-page app
scripts/        install.sh, uninstall.sh, dev.sh
data/           config.json + runs.jsonl (gitignored)
ARCHIVED/       legacy v0 shell + plist (kept for reference)
```

## Status

Early. Works on macOS. Linux systemd path is included but lightly tested. Windows: not supported (use WSL).

## License

MIT — see [LICENSE](./LICENSE).
