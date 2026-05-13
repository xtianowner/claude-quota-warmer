"""Schedule healthcheck runs at the configured interval."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from .config import ConfigStore
from .models import Config, RunRecord
from .runner import run_once
from .storage import RunStore

log = logging.getLogger("healthcheck.scheduler")
JOB_ID = "healthcheck-job"


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
        # Initialize consecutive_successes from history
        last = self.run_store.last()
        if last and last.status == "success":
            self._consecutive_successes = self._count_tail_successes()
        self._apply(cfg)

    def shutdown(self) -> None:
        if self._scheduler.running:
            self._scheduler.shutdown(wait=False)

    # ---- public API ---------------------------------------------------

    def apply_config(self, cfg: Config) -> None:
        self._apply(cfg)

    def next_run_at(self) -> Optional[str]:
        job = self._scheduler.get_job(JOB_ID)
        if not job or job.next_run_time is None:
            return None
        return job.next_run_time.astimezone(timezone.utc).isoformat()

    @property
    def consecutive_successes(self) -> int:
        return self._consecutive_successes

    @property
    def running(self) -> bool:
        return self._running

    async def trigger_now(self) -> RunRecord:
        return await self._execute(trigger="manual")

    # ---- internals ----------------------------------------------------

    def _apply(self, cfg: Config) -> None:
        existing = self._scheduler.get_job(JOB_ID)
        if not cfg.enabled:
            if existing:
                self._scheduler.remove_job(JOB_ID)
            return
        trigger = IntervalTrigger(seconds=cfg.interval_seconds)
        if existing:
            self._scheduler.reschedule_job(JOB_ID, trigger=trigger)
        else:
            self._scheduler.add_job(
                self._scheduled_run,
                trigger=trigger,
                id=JOB_ID,
                replace_existing=True,
                misfire_grace_time=600,
                coalesce=True,
                max_instances=1,
            )

    async def _scheduled_run(self) -> None:
        await self._execute(trigger="schedule")

    async def _execute(self, trigger: str) -> RunRecord:
        # Coalesce concurrent triggers — never run two at once.
        if self._run_lock.locked():
            log.warning("healthcheck already in flight; coalescing %s trigger", trigger)
        async with self._run_lock:
            self._running = True
            try:
                cfg = self.config_store.load()
                record = await run_once(cfg, trigger=trigger)
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
            # list_recent returns newest first
            if r.status == "success":
                n += 1
            else:
                break
        return n
