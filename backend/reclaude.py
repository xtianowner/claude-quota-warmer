"""reclaude.ai client — login + carpool-quota fetch.

API surface (reverse-engineered from claude-hud's proxy-usage-fetcher.ts /
proxy-login.ts / proxy-usage.ts):

  POST https://reclaude.ai/api/auth/login
    body: { "email": "...", "password": "..." }
    → 200, Set-Cookie: rc_sid=<value>

  GET  https://reclaude.ai/api/app/billing/carpool-quota
    cookie: rc_sid=<value>
    → 200 JSON { used_usd, quota_usd, resets_at_ms, enabled, status, ... }
    → 401 if cookie missing / expired
"""
from __future__ import annotations

import logging
import re
from typing import Optional

import httpx

from .models import QuotaSnapshot

log = logging.getLogger("healthcheck.reclaude")

BASE_URL = "https://reclaude.ai"
LOGIN_PATH = "/api/auth/login"
QUOTA_PATH = "/api/app/billing/carpool-quota"
USER_AGENT = "claude-quota-warmer/0.1"
DEFAULT_TIMEOUT = 15.0

_RC_SID_RE = re.compile(r"(?:^|[\s;])\s*rc_sid=([^;]+)", re.IGNORECASE)


class ReclaudeError(Exception):
    """Network / server error while talking to reclaude.ai."""


class LoginRequired(ReclaudeError):
    """rc_sid is missing or rejected — caller should re-login()."""


class AccountDisabled(ReclaudeError):
    """Account is reachable but carpool is disabled / status != active."""


class ReclaudeClient:
    def __init__(self, base_url: str = BASE_URL, timeout: float = DEFAULT_TIMEOUT):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def login(self, email: str, password: str) -> str:
        """POST credentials, return fresh rc_sid. Raises LoginRequired on 401."""
        url = self.base_url + LOGIN_PATH
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as c:
            try:
                resp = await c.post(
                    url,
                    json={"email": email, "password": password},
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                )
            except httpx.RequestError as exc:
                raise ReclaudeError(f"login request failed: {exc}") from exc

        if resp.status_code == 401:
            raise LoginRequired("invalid email or password")
        if resp.status_code >= 400:
            raise ReclaudeError(
                f"login HTTP {resp.status_code}: {resp.text[:200]}"
            )

        # rc_sid arrives via Set-Cookie. Prefer the parsed cookie jar; fall
        # back to scanning raw Set-Cookie headers for stricter cases.
        rc_sid: Optional[str] = resp.cookies.get("rc_sid")
        if not rc_sid:
            for line in resp.headers.get_list("set-cookie"):
                m = _RC_SID_RE.search(line)
                if m:
                    rc_sid = m.group(1).strip()
                    break
        if not rc_sid:
            raise ReclaudeError("login ok but no rc_sid in Set-Cookie")
        return rc_sid

    async def get_quota(self, rc_sid: str) -> QuotaSnapshot:
        """Fetch current 5h-window snapshot. Raises LoginRequired on 401."""
        if not rc_sid:
            raise LoginRequired("no rc_sid available")
        url = self.base_url + QUOTA_PATH
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as c:
            try:
                resp = await c.get(
                    url,
                    headers={
                        "Cookie": f"rc_sid={rc_sid}",
                        "Accept": "application/json",
                        "User-Agent": USER_AGENT,
                    },
                )
            except httpx.RequestError as exc:
                raise ReclaudeError(f"quota request failed: {exc}") from exc

        if resp.status_code == 401:
            raise LoginRequired("rc_sid expired")
        if resp.status_code >= 400:
            raise ReclaudeError(
                f"quota HTTP {resp.status_code}: {resp.text[:200]}"
            )

        try:
            data = resp.json()
        except ValueError as exc:
            raise ReclaudeError(f"quota response not json: {exc}") from exc

        try:
            snap = QuotaSnapshot(
                used_usd=float(data.get("used_usd", 0.0)),
                quota_usd=float(data.get("quota_usd", 0.0)),
                resets_at_ms=int(data["resets_at_ms"]),
                enabled=bool(data.get("enabled", True)),
                status=str(data.get("status", "unknown")),
            )
        except (KeyError, TypeError, ValueError) as exc:
            raise ReclaudeError(
                f"quota response missing/invalid fields: {exc}; raw={data!r}"
            ) from exc

        if not snap.enabled or snap.status not in ("active", "unknown"):
            raise AccountDisabled(
                f"reclaude account not active: enabled={snap.enabled} status={snap.status!r}"
            )
        return snap
