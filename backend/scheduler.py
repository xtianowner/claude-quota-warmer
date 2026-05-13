"""Schedule healthcheck runs at user-defined absolute datetimes.

Two scheduling modes:

- "manual" (default): user adds SchedulePoints via the UI; each gets a
  DateTrigger and fires once.

- "auto_reclaude": a 10-minute IntervalTrigger polls reclaude's carpool
  quota API, computes max(resets_at_ms, now) + auto_offset_seconds, and
  keeps exactly one future "source=auto" point on the list — adding,
  replacing on drift > 60s, or leaving it alone. The polling job is the
  *only* source of auto points; firing a point does not chain on its own.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from dateutil import parser as dt_parser

from .config import ConfigStore
from .models import Config, QuotaSnapshot, RunRecord, SchedulePoint
from .reclaude import (
    AccountDisabled,
    LoginRequired,
    ReclaudeClient,
    ReclaudeError,
)
from .runner import run_once
from .secrets import SecretsStore
from .storage import RunStore

log = logging.getLogger("healthcheck.scheduler")
JOB_PREFIX = "point-"
POLL_JOB_ID = "reclaude-poll"
POLL_INTERVAL_MINUTES = 10
DRIFT_TOLERANCE_SECONDS = 60


def _job_id(point_id: str) -> str:
    return f"{JOB_PREFIX}{point_id}"


def _parse_iso(s: str) -> datetime:
    """Parse an ISO datetime; assume UTC if no tzinfo present."""
    dt = dt_parser.isoparse(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class HealthcheckScheduler:
    def __init__(
        self,
        config_store: ConfigStore,
        run_store: RunStore,
        secrets_store: SecretsStore | None = None,
        reclaude_client: ReclaudeClient | None = None,
    ):
        self.config_store = config_store
        self.run_store = run_store
        self.secrets = secrets_store or SecretsStore(config_store.path.parent / "secrets.json")
        self.reclaude = reclaude_client or ReclaudeClient()
        self._scheduler = AsyncIOScheduler(timezone=timezone.utc)
        self._run_lock = asyncio.Lock()
        self._poll_lock = asyncio.Lock()
        self._consecutive_successes = 0
        self._running = False
        self._latest_snapshot: QuotaSnapshot | None = None
        self._reclaude_error: str | None = None

    # ---- lifecycle ----------------------------------------------------

    def start(self) -> None:
        self._scheduler.start()
        cfg = self.config_store.load()
        cfg = self._fail_past_pending(cfg)
        self._consecutive_successes = self._count_tail_successes()
        self._ensure_poll_job()
        self._apply(cfg)
        if cfg.mode == "auto_reclaude":
            self._kick_immediate_poll()

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    # ---- public API ---------------------------------------------------

    def apply_config(self, cfg: Config) -> None:
        self._apply(cfg)
        if cfg.mode == "auto_reclaude":
            self._kick_immediate_poll()

    def next_point(self) -> SchedulePoint | None:
        cfg = self.config_store.load()
        now = datetime.now(timezone.utc)
        upcoming = [
            p for p in cfg.schedule_points
            if p.status == "pending" and _parse_iso(p.scheduled_at) >= now
        ]
        upcoming.sort(key=lambda p: _parse_iso(p.scheduled_at))
        return upcoming[0] if upcoming else None

    @property
    def consecutive_successes(self) -> int:
        return self._consecutive_successes

    @property
    def running(self) -> bool:
        return self._running

    @property
    def latest_snapshot(self) -> QuotaSnapshot | None:
        return self._latest_snapshot

    @property
    def reclaude_error(self) -> str | None:
        return self._reclaude_error

    def add_point(self, scheduled_at_iso: str, source: str = "manual") -> Config:
        dt = _parse_iso(scheduled_at_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        cfg = self.config_store.load()
        point = SchedulePoint(
            id=uuid.uuid4().hex[:12],
            scheduled_at=dt.isoformat(),
            source=source,  # type: ignore[arg-type]
        )
        cfg.schedule_points.append(point)
        saved = self.config_store.save(cfg)
        self._apply(saved)
        return saved

    def remove_point(self, point_id: str) -> Config:
        cfg = self.config_store.load()
        cfg.schedule_points = [p for p in cfg.schedule_points if p.id != point_id]
        saved = self.config_store.save(cfg)
        self._apply(saved)
        return saved

    async def trigger_now(self) -> RunRecord:
        return await self._execute(trigger="manual", point=None)

    async def poll_reclaude_now(self) -> None:
        """Force a poll cycle; used by /api/reclaude/login and manual refresh."""
        await self._poll_reclaude_and_resync()

    # ---- internals: DateTrigger jobs ----------------------------------

    def _apply(self, cfg: Config) -> None:
        existing_jobs = {
            j.id for j in self._scheduler.get_jobs() if j.id.startswith(JOB_PREFIX)
        }
        wanted: dict[str, SchedulePoint] = {}
        if cfg.enabled:
            for p in cfg.schedule_points:
                if p.status != "pending":
                    continue
                wanted[_job_id(p.id)] = p

        for jid in existing_jobs - set(wanted.keys()):
            try:
                self._scheduler.remove_job(jid)
            except Exception:
                pass

        for jid, point in wanted.items():
            if jid in existing_jobs:
                continue
            run_dt = _parse_iso(point.scheduled_at)
            if run_dt < datetime.now(timezone.utc):
                continue
            self._scheduler.add_job(
                self._fire_point,
                trigger=DateTrigger(run_date=run_dt),
                id=jid,
                args=[point.id],
                replace_existing=True,
                misfire_grace_time=900,
                coalesce=True,
                max_instances=1,
            )

    def _fail_past_pending(self, cfg: Config) -> Config:
        now = datetime.now(timezone.utc)
        changed = False
        for p in cfg.schedule_points:
            if p.status == "pending" and _parse_iso(p.scheduled_at) < now:
                p.status = "failed"
                p.note = "missed: daemon was not running at the scheduled time"
                changed = True
        if changed:
            return self.config_store.save(cfg)
        return cfg

    async def _fire_point(self, point_id: str) -> None:
        cfg = self.config_store.load()
        point = next((p for p in cfg.schedule_points if p.id == point_id), None)
        if not point or point.status != "pending":
            return

        point.status = "running"
        self.config_store.save(cfg)

        record = await self._execute(trigger="schedule", point=point)

        cfg = self.config_store.load()
        for p in cfg.schedule_points:
            if p.id == point_id:
                p.status = "done" if record.status == "success" else "failed"
                p.run_id = record.id
                if record.status == "fail":
                    last = record.attempts[-1] if record.attempts else None
                    p.note = last.error if last and last.error else "all attempts failed"
                else:
                    p.note = None
                break
        self.config_store.save(cfg)

    async def _execute(self, trigger: str, point: SchedulePoint | None) -> RunRecord:
        if self._run_lock.locked():
            log.warning("healthcheck already in flight; coalescing %s trigger", trigger)
        async with self._run_lock:
            self._running = True
            try:
                cfg = self.config_store.load()
                record = await run_once(cfg, trigger=trigger)
                if point is not None:
                    record.point_id = point.id
                self.run_store.append(record)
                if record.status == "success":
                    self._consecutive_successes += 1
                else:
                    self._consecutive_successes = 0
                return record
            finally:
                self._running = False

    def _count_tail_successes(self) -> int:
        n = 0
        for r in self.run_store.list_recent(limit=200):
            if r.status == "success":
                n += 1
            else:
                break
        return n

    # ---- internals: reclaude poll job ---------------------------------

    def _ensure_poll_job(self) -> None:
        """Register the 10-minute polling job once; it self-skips when mode != auto."""
        if self._scheduler.get_job(POLL_JOB_ID) is not None:
            return
        self._scheduler.add_job(
            self._poll_reclaude_and_resync,
            trigger=IntervalTrigger(minutes=POLL_INTERVAL_MINUTES),
            id=POLL_JOB_ID,
            replace_existing=True,
            misfire_grace_time=300,
            coalesce=True,
            max_instances=1,
        )

    def _kick_immediate_poll(self) -> None:
        """Queue a one-shot poll to run ASAP (used when user enables auto mode)."""
        try:
            self._scheduler.add_job(
                self._poll_reclaude_and_resync,
                trigger=DateTrigger(run_date=datetime.now(timezone.utc) + timedelta(seconds=1)),
                id=f"{POLL_JOB_ID}-kick-{uuid.uuid4().hex[:6]}",
                misfire_grace_time=60,
                max_instances=1,
            )
        except Exception as exc:
            log.warning("failed to queue immediate reclaude poll: %s", exc)

    async def _poll_reclaude_and_resync(self) -> None:
        """Pull /carpool-quota, then ensure exactly one future auto point matches resets_at_ms.

        We deliberately `await` the lock rather than skipping when it's
        held: callers (login handler, mode switch, manual refresh, interval)
        rely on the post-poll state being fresh once their call returns.
        """
        async with self._poll_lock:
            cfg = self.config_store.load()
            if cfg.mode != "auto_reclaude":
                return

            email = cfg.reclaude_email
            password = self.secrets.get_password()
            cookie = self.secrets.get_cookie()

            if not email or (not password and not cookie):
                self._reclaude_error = "not_configured"
                return

            try:
                snap = await self._fetch_quota_with_refresh(email, password, cookie)
            except LoginRequired:
                self._reclaude_error = "login_required"
                log.warning("reclaude poll: login required (cookie expired and password missing/invalid)")
                return
            except AccountDisabled as exc:
                self._reclaude_error = "account_disabled"
                log.warning("reclaude poll: %s", exc)
                return
            except ReclaudeError as exc:
                self._reclaude_error = "network"
                log.warning("reclaude poll: network/server error: %s", exc)
                return

            self._latest_snapshot = snap
            self._reclaude_error = None

            now = datetime.now(timezone.utc)
            resets_at = datetime.fromtimestamp(snap.resets_at_ms / 1000, tz=timezone.utc)
            desired_fire_at = max(resets_at, now) + timedelta(seconds=cfg.auto_offset_seconds)

            cfg = self.config_store.load()  # re-load: state may have shifted
            future_auto = [
                p for p in cfg.schedule_points
                if p.source == "auto" and p.status == "pending"
                and _parse_iso(p.scheduled_at) >= now
            ]
            future_auto.sort(key=lambda p: _parse_iso(p.scheduled_at))

            if not future_auto:
                # No future auto point — append one.
                cfg.schedule_points.append(SchedulePoint(
                    id=uuid.uuid4().hex[:12],
                    scheduled_at=desired_fire_at.isoformat(),
                    source="auto",
                ))
                saved = self.config_store.save(cfg)
                self._apply(saved)
                log.info(
                    "reclaude poll: scheduled auto point at %s (resets_at=%s)",
                    desired_fire_at.isoformat(), resets_at.isoformat(),
                )
                return

            current = future_auto[0]
            current_fire = _parse_iso(current.scheduled_at)
            drift = abs((current_fire - desired_fire_at).total_seconds())

            # Drop any extras beyond the first auto point — UI invariant: one at a time.
            extras = [p.id for p in future_auto[1:]]
            if extras:
                cfg.schedule_points = [p for p in cfg.schedule_points if p.id not in extras]

            if drift <= DRIFT_TOLERANCE_SECONDS and not extras:
                return  # already aligned, nothing to do

            if drift > DRIFT_TOLERANCE_SECONDS:
                # Replace current with a fresh point at the new time.
                cfg.schedule_points = [p for p in cfg.schedule_points if p.id != current.id]
                cfg.schedule_points.append(SchedulePoint(
                    id=uuid.uuid4().hex[:12],
                    scheduled_at=desired_fire_at.isoformat(),
                    source="auto",
                ))
                log.info(
                    "reclaude poll: rescheduled auto point %s → %s (drift=%.0fs)",
                    current.scheduled_at, desired_fire_at.isoformat(), drift,
                )

            saved = self.config_store.save(cfg)
            self._apply(saved)

    async def _fetch_quota_with_refresh(
        self,
        email: str,
        password: str | None,
        cookie: str | None,
    ) -> QuotaSnapshot:
        """Try cookie, on LoginRequired re-login with password and retry once."""
        if cookie:
            try:
                return await self.reclaude.get_quota(cookie)
            except LoginRequired:
                cookie = None  # fall through to login

        if not password:
            raise LoginRequired("cookie missing/expired and no password to refresh")

        new_cookie = await self.reclaude.login(email, password)
        self.secrets.set_cookie(new_cookie)
        return await self.reclaude.get_quota(new_cookie)
