#!/usr/bin/env bash
# Install claude-quota-warmer as a background daemon.
# - macOS: registers a LaunchAgent that runs the daemon under your user session.
# - Linux: prints a systemd --user unit you can drop in place.
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HEALTHCHECK_HOST:-127.0.0.1}"
PORT="${HEALTHCHECK_PORT:-8765}"
LABEL="${HEALTHCHECK_LABEL:-com.user.claude-quota-warmer}"
PY="${HEALTHCHECK_PYTHON:-$(command -v python3 || command -v python)}"

cd "$PROJECT_DIR"

if [[ -z "${PY:-}" ]]; then
  echo "Error: no python found in PATH; set HEALTHCHECK_PYTHON to a python>=3.10 binary" >&2
  exit 1
fi

echo "==> Using python: $PY ($($PY --version 2>&1))"

# 1. venv + backend deps
if [[ ! -d ".venv" ]]; then
  echo "==> Creating .venv"
  "$PY" -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
echo "==> Installing backend deps"
pip install --upgrade pip >/dev/null
pip install -e . >/dev/null

# 2. frontend build (only if frontend/dist missing or stale)
if command -v node >/dev/null 2>&1; then
  if [[ ! -d "frontend/dist" || "frontend/src" -nt "frontend/dist" ]]; then
    echo "==> Building frontend (npm install + build)"
    (cd frontend && npm install --silent && npm run build)
  else
    echo "==> Frontend dist exists, skipping build"
  fi
else
  echo "Warning: node not found; frontend won't be served. API still works at http://$HOST:$PORT" >&2
fi

# 3. Install OS-level service
case "$(uname -s)" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    LOG_DIR="$PROJECT_DIR/data/logs"
    mkdir -p "$LOG_DIR"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${PROJECT_DIR}/.venv/bin/python</string>
    <string>-m</string><string>backend.main</string>
    <string>--host</string><string>${HOST}</string>
    <string>--port</string><string>${PORT}</string>
  </array>
  <key>WorkingDirectory</key><string>${PROJECT_DIR}</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${LOG_DIR}/daemon.out.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/daemon.err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME}/.local/bin</string>
  </dict>
</dict>
</plist>
PLIST
    echo "==> Wrote LaunchAgent: $PLIST"
    # Bootstrap (idempotent: bootout first if already loaded)
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "==> LaunchAgent loaded. Open http://$HOST:$PORT"
    ;;
  Linux)
    UNIT_PATH="$HOME/.config/systemd/user/${LABEL}.service"
    mkdir -p "$(dirname "$UNIT_PATH")"
    cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Claude Code healthcheck daemon
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${PROJECT_DIR}
ExecStart=${PROJECT_DIR}/.venv/bin/python -m backend.main --host ${HOST} --port ${PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
UNIT
    echo "==> Wrote systemd unit: $UNIT_PATH"
    systemctl --user daemon-reload
    systemctl --user enable --now "${LABEL}.service"
    echo "==> Service started. Open http://$HOST:$PORT"
    ;;
  *)
    echo "Unsupported platform: $(uname -s). Run manually:"
    echo "  $PROJECT_DIR/.venv/bin/python -m backend.main --host $HOST --port $PORT"
    ;;
esac

echo
echo "Done. UI: http://$HOST:$PORT"
echo "API docs: http://$HOST:$PORT/docs"
