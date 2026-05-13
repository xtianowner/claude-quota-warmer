#!/usr/bin/env bash
# Run backend + frontend in dev mode (hot reload).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

if [[ ! -d ".venv" ]]; then
  echo "==> Creating .venv"
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate
pip install -e . >/dev/null

(cd frontend && [[ -d node_modules ]] || npm install)

# Start backend on port 8765 and frontend dev server on 5173 (with proxy).
cleanup() {
  kill $(jobs -p) 2>/dev/null || true
}
trap cleanup EXIT INT TERM

python -m backend.main --host 127.0.0.1 --port 8765 --reload &
(cd frontend && npm run dev) &
wait
