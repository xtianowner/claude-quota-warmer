"""Schedule healthcheck runs at user-defined absolute datetimes."""
from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.date import DateTrigger
from dateutil import parser as dt_parser

from .config import ConfigStore
from .models import Config, RunRecord, SchedulePoint
from .runner import run_once
from .storage import RunStore

log = logging.getLogger("healthcheck.scheduler")
JOB_PREFIX = "point-"


def _job_id(point_id: str) -> str:
    return f"{JOB_PREFIX}{point_id}"


def _parse_iso(s: str) -> datetime:
    """Parse an ISO datetime; assume UTC if no tzinfo present."""
    dt = dt_parser.isoparse(s)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class HealthcheckScheduler:
    def __init__(self, config_store: ConfigStore, run_store: RunStore):
        self.config_store = config_store
        self.run_store = run_store
        self._scheduler = AsyncIOScheduler(timezone=timezone.utc)
        self._run_lock = asyncio.Lock()
        self._consecutive_successes = 0
        self._running = False

    # ---- lifecycle ----------------------------------------------------

    def start(self) -> None:
        self._scheduler.start()
        cfg = self.config_store.load()
        # Mark past-due pending points as missed on startup.
        cfg = self._fail_past_pending(cfg)
        self._consecutive_successes = self._count_tail_successes()
        self._apply(cfg)

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    # ---- public API ---------------------------------------------------

    def apply_config(self, cfg: Config) -> None:
        self._apply(cfg)

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

    def add_point(self, scheduled_at_iso: str) -> Config:
        # Parse and normalize to ISO with offset preserved
        dt = _parse_iso(scheduled_at_iso)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        cfg = self.config_store.load()
        point = SchedulePoint(id=uuid.uuid4().hex[:12], scheduled_at=dt.isoformat())
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

    # ---- internals ----------------------------------------------------

    def _apply(self, cfg: Config) -> None:
        # Diff: jobs we want vs jobs scheduler has now.
        existing_jobs = {
            j.id for j in self._scheduler.get_jobs() if j.id.startswith(JOB_PREFIX)
        }
        wanted: dict[str, SchedulePoint] = {}
        if cfg.enabled:
            for p in cfg.schedule_points:
                if p.status != "pending":
                    continue
                wanted[_job_id(p.id)] = p

        # Remove jobs no longer wanted
        for jid in existing_jobs - set(wanted.keys()):
            try:
                self._scheduler.remove_job(jid)
            except Exception:  # already gone
                pass

        # Add jobs that don't exist yet
        for jid, point in wanted.items():
            if jid in existing_jobs:
                # Reschedule in case the time changed (unlikely; we don't edit)
                continue
            run_dt = _parse_iso(point.scheduled_at)
            # If somehow the point is in the past now and still pending, fire soon
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

        # Mark running
        point.status = "running"
        self.config_store.save(cfg)

        record = await self._execute(trigger="schedule", point=point)

        # Re-load, update point status
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
