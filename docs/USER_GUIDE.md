# User guide

Plain-language walkthrough for using `claude-quota-warmer`. For
architecture and API details see [ARCHITECTURE.md](./ARCHITECTURE.md)
and [API.md](./API.md).

## What this is for

Claude Code's plan grants quota in **rolling 5-hour windows**. Unused
quota inside a window can't be carried over — it expires when the
window closes. If you don't use Claude Code for a stretch of hours
(e.g. overnight), the window closes empty and that quota is gone.

This tool keeps a daemon running on your machine. You tell it
"trigger a healthcheck at 2026-05-14 05:30" and at that moment it
sends one real `claude` (or `reclaude`) request. As long as the
response comes back with the expected marker, the window for that
period counts as used.

You stay in control of *when* it fires — it's not a constant heartbeat,
it's a list of moments you choose.

## Requirements

- macOS or Linux
- Python ≥ 3.10
- Node.js ≥ 18 (only for building the UI; not needed at runtime)
- The CLI you want to keep alive: `claude` or `reclaude`, already
  installed and authenticated. You can verify with
  `command -v reclaude && reclaude -p "hello"`.

## Install

```bash
git clone https://github.com/xtianowner/claude-quota-warmer.git
cd claude-quota-warmer
./scripts/install.sh
```

What the installer does:

1. Creates a Python virtual environment at `./.venv`
2. Installs backend dependencies (FastAPI, APScheduler, Pydantic)
3. Builds the frontend bundle into `frontend/dist/`
4. Registers a background service:
   - **macOS**: a LaunchAgent at `~/Library/LaunchAgents/<label>.plist`
   - **Linux**: a systemd user unit at `~/.config/systemd/user/<label>.service`
5. Starts the service. It binds to `127.0.0.1:8765` by default.

Open the UI in your browser:

> http://127.0.0.1:8765

### Optional install knobs

```bash
HEALTHCHECK_HOST=127.0.0.1 \
HEALTHCHECK_PORT=8765 \
HEALTHCHECK_LABEL=com.yourname.claude-keepalive \
HEALTHCHECK_PYTHON=/opt/homebrew/bin/python3.12 \
./scripts/install.sh
```

## First-time setup in the UI

The dashboard has four sections, top to bottom:

### 1. Header
- The **language switch** (`ZH` / `EN`) is in the top-right.
- The **master toggle** next to it enables/disables the entire schedule
  at once. While disabled, no trigger point will fire even if its time
  is reached. Disabled is the safe default after install.

### 2. Runtime status
- **Next trigger** — the soonest upcoming trigger point + a live
  countdown.
- **Last result** — success or failure of the most recent run.
- **Streak** — how many runs in a row have succeeded.
- **Trigger now** (top-right of this card) — runs one healthcheck
  immediately. Useful for testing your setup. Does **not** affect
  your schedule list.

### 3. Trigger schedule
This is where you say *when* the healthchecks should fire.

To add a moment:
1. Pick a date and time in the input. The picker is your **local
   timezone**.
2. Click **Add**. The point shows up in the list with state `Pending`
   and a countdown.

Each row in the list shows:
- A status badge (`Pending`, `Running`, `Done`, `Failed`)
- The absolute datetime
- A live countdown (only for pending points)
- A trash icon to delete the point

When a point's time arrives, the daemon fires the healthcheck. If
everything goes through, the badge flips to `Done`. If all retries
fail, it flips to `Failed` with an inline note explaining why.

Tip: stage a chain like `tomorrow 05:30 → tomorrow 10:30 → tomorrow
15:30 → tomorrow 20:30` to cover four 5-hour windows in one day.

### 4. Advanced config (collapsed by default)

Click **Show** on the *Advanced config* card to edit:

| Field | What it does |
|---|---|
| Command | The binary to spawn. Default `reclaude`. Use `claude` for the vanilla CLI. |
| Per-attempt timeout | How many seconds to wait for each subprocess before killing it. Default 120. |
| Prompt | The prompt body sent via `-p`. Default `Claude Code healthcheck: 请只回复 HEALTHCHECK_OK`. |
| Expected marker | A substring that must appear in the output for the run to count as success. Default `HEALTHCHECK_OK`. |
| Max retries | If an attempt fails, how many more to try. Default 3 (so 4 attempts max). |
| Retry backoff | Comma-separated seconds. Sleep this long before retry N. Default `30,120,300`. |

Click **Save config** to persist. The new settings take effect on the
next run.

### 5. History
Newest-first list of runs. Click a row to expand the per-attempt
detail:

- The exit code (`0` = subprocess success)
- The attempt duration
- The tail of the combined stdout+stderr (so you can read what the
  model actually replied)
- Any error message — e.g. `expected marker 'XYZ' not in output`,
  `command not found in PATH`, `timed out after 120s`.

## Common tasks

### Verify it really runs (not a fake UI)
See [VERIFICATION.md](./VERIFICATION.md). Short version: change the
*expected marker* to something nonsensical and click **Trigger now**
— if the dashboard goes red with `expected marker '...' not in output`,
the request was real.

### Change when it triggers
- Wrong time: delete that point in the list, add a new one with the
  correct datetime.
- Wrong day altogether: delete + add.
- Times near each other are fine; the daemon coalesces overlapping runs.

### Switch language
Click `ZH` or `EN` in the header. The choice is remembered in your
browser's `localStorage`.

### Update the tool
```bash
cd ~/path/to/claude-quota-warmer
git pull
./scripts/install.sh   # idempotent; rebuilds and re-registers
```

### Uninstall

```bash
./scripts/uninstall.sh
```

Removes the LaunchAgent / systemd unit. Leaves `data/` (your config
and run history) intact in case you want to keep a record. Delete
the project directory to remove everything.

## Troubleshooting

### "Status: Failed" / "command not found in PATH"
The daemon couldn't find the `reclaude` (or `claude`) binary on `PATH`.
- Run `command -v reclaude` in a fresh terminal to see where it is.
- macOS LaunchAgents inherit a restricted PATH. The installer adds
  `/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`. If your CLI
  lives elsewhere, edit `~/Library/LaunchAgents/<label>.plist`, find
  the `PATH` entry, append your directory, and reload:
  ```bash
  launchctl bootout gui/$(id -u)/<label>
  launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/<label>.plist
  ```

### "Status: Failed" / "expected marker '...' not in output"
The subprocess ran (exit 0) but the response didn't include the
expected marker. Possible causes:
- The prompt was changed but the marker wasn't updated to match.
- The model returned a refusal or a different style of answer.

Expand the history row to see the actual output. Either tweak the
prompt to push the model toward the marker, or relax the marker.

### "Status: Failed" / "timed out after 120s"
The subprocess didn't finish in time. Bump the *Per-attempt timeout*
in Advanced config. Default is 120s; safe upper bound is 600s.

### Toggle is on, but nothing fires
- Check the *Next trigger* card. If it shows `—`, you have no
  pending points. Add one.
- Check the time on the point: if it's already in the past and the
  daemon was offline at the time, the point gets marked `Failed
  (missed)` on next startup.
- Check the daemon is alive: `curl http://127.0.0.1:8765/api/health`
  → should return `{"ok":true}`.

### Daemon not running after reboot
- **macOS**: `launchctl print gui/$(id -u)/<label>` to inspect.
  If absent, re-run `./scripts/install.sh`.
- **Linux**: `systemctl --user status <label>.service`.

### Port 8765 in use
Re-install with `HEALTHCHECK_PORT=8766 ./scripts/install.sh`.

## Where things live

```
~/path/to/claude-quota-warmer/
├── data/
│   ├── config.json        # Your settings + schedule points
│   ├── runs.jsonl         # Append-only run history
│   └── logs/
│       ├── daemon.out.log
│       └── daemon.err.log
└── .venv/                 # Python virtualenv
```

The dashboard's *Refresh* button on the History card re-reads this
file. You can also tail logs directly:

```bash
tail -f ~/path/to/claude-quota-warmer/data/logs/daemon.out.log
```
