#!/usr/bin/env bash
# Remove the OS-level service. Leaves code and data/ intact.
set -euo pipefail

LABEL="${HEALTHCHECK_LABEL:-com.user.claude-code-healthcheck}"

case "$(uname -s)" in
  Darwin)
    PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed LaunchAgent: $PLIST"
    ;;
  Linux)
    UNIT="$HOME/.config/systemd/user/${LABEL}.service"
    systemctl --user disable --now "${LABEL}.service" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "Removed systemd unit: $UNIT"
    ;;
  *)
    echo "No OS-level service installed on $(uname -s); nothing to remove."
    ;;
esac
