# claude-quota-warmer

> Keep your Claude Code 5-hour quota window warm by firing one real
> request at moments you choose.

A small daemon + web UI for Claude Code (or [reclaude](https://github.com/xtianowner/reclaude))
users. You stage a list of absolute datetimes ("2026-05-14 05:30 local
time") and the daemon spawns one real `claude -p ...` call at each
moment, verifies the response, retries on failure, and records the
result. Local-only — nothing leaves your machine except the request
that Claude Code itself makes.

<p align="center">
  <img src="docs/images/dashboard-desktop.png" width="720" alt="Desktop dashboard">
</p>

<p align="center">
  <img src="docs/images/dashboard-mobile.png" width="320" alt="Mobile dashboard">
  &nbsp;
  <img src="docs/images/dashboard-history.png" width="380" alt="History expanded">
</p>

## Why

Claude Code plans grant quota in **rolling 5-hour windows**. Unused
quota inside a window can't be carried over. If you don't touch
Claude Code for half a day, the windows that pass empty are gone.

This tool lets you say "fire one healthcheck at these specific times"
so otherwise-idle windows count as used. It deliberately does *not*
pulse continuously — you choose the moments.

> The request itself consumes a tiny bit of quota. The point is that
> one cheap healthcheck per window is a lot less than forfeiting the
> whole window.

## Features

- **Absolute datetime scheduling** — stage any number of one-off
  trigger points; each fires once and records the result
- **Retry to success** — failed attempts retry with configurable
  exponential backoff before being marked failed
- **Real-output validation** — checks the subprocess's actual stdout
  for a marker; not a hardcoded green pixel ([see VERIFICATION.md](./docs/VERIFICATION.md))
- **Persistent across reboots** — installs a macOS LaunchAgent or
  Linux systemd user unit that keeps the daemon alive
- **Web UI** — glassmorphism dashboard, responsive down to 320px,
  zh/en bilingual
- **Local-only** — daemon binds to `127.0.0.1:8765`; no auth, no
  telemetry
- **MIT licensed**

## Quick start

Requires **Python ≥ 3.10**, **Node.js ≥ 18** (for the one-time UI
build), and an authenticated **`claude`** or **`reclaude`** CLI on
your `PATH`.

```bash
git clone https://github.com/xtianowner/claude-quota-warmer.git
cd claude-quota-warmer
./scripts/install.sh
```

Then open <http://127.0.0.1:8765>:

1. Click **Add a trigger point**, pick a future datetime, **Add**.
2. Click the **Enabled** toggle in the top-right.
3. Optional: click **Trigger now** to verify everything works.

That's the whole flow. The full [User guide](./docs/USER_GUIDE.md)
covers configuration, troubleshooting, and uninstalling.

## How it works

```
launchd / systemd → python -m backend.main (127.0.0.1:8765)
                    │
                    ├─ FastAPI: REST + serves the React SPA
                    ├─ APScheduler: one DateTrigger per pending point
                    └─ at fire time:
                          asyncio.create_subprocess_exec(reclaude, -p, prompt)
                          → check exit==0 AND marker in stdout
                          → retry with backoff on failure
                          → persist RunRecord
```

Storage:
- `data/config.json` — your settings + the schedule point list
- `data/runs.jsonl` — append-only run history with per-attempt detail

Architecture diagram, data model, and lifecycle details are in
[ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Docs

| | |
|---|---|
| [User guide](./docs/USER_GUIDE.md) | Day-to-day usage, troubleshooting, FAQs |
| [Architecture](./docs/ARCHITECTURE.md) | Internal design, modules, data flow |
| [API reference](./docs/API.md) | REST endpoints; OpenAPI live at `/docs` |
| [Verification](./docs/VERIFICATION.md) | How to prove the success badge isn't fake |
| [Lessons](./docs/LESSONS.md) | Design decisions retired during development |

## Development

```bash
./scripts/dev.sh
# backend on :8765 with --reload
# vite dev on :5173 (proxies /api to :8765)
```

Open <http://127.0.0.1:5173>.

The `scripts/dev/` directory has Playwright-based visual audit
scripts used during UI work. See [scripts/dev/README.md](./scripts/dev/README.md).

## Project status

Early. Works on macOS (tested). Linux systemd path included but
lightly tested. Windows is not supported (use WSL).

PRs welcome — especially Linux corrections, additional locales,
alternative service backends (cron, NSSM for Windows), or
verification additions.

## License

MIT — see [LICENSE](./LICENSE).
