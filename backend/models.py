"""Pydantic models for config, schedule points, runs and API responses."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


PointStatus = Literal["pending", "running", "done", "failed"]


class SchedulePoint(BaseModel):
    """A single absolute datetime at which to fire a healthcheck."""

    id: str
    # ISO 8601 with timezone offset, e.g. "2026-05-14T05:30:00+08:00"
    scheduled_at: str
    status: PointStatus = "pending"
    # Linked RunRecord.id once executed
    run_id: Optional[str] = None
    # Free-form note shown on the point status, e.g. "missed (past time on startup)"
    note: Optional[str] = None
    created_at: str = Field(default_factory=utcnow_iso)


class Config(BaseModel):
    """Persisted user-editable configuration."""

    enabled: bool = False
    schedule_points: list[SchedulePoint] = Field(default_factory=list)

    # Command to invoke. Default `reclaude`; can be set to `claude` for vanilla Claude Code.
    command: str = "reclaude"
    extra_args: list[str] = Field(default_factory=list)
    prompt: str = "Claude Code healthcheck: 请只回复 HEALTHCHECK_OK"
    expected_marker: str = "HEALTHCHECK_OK"
    timeout_seconds: int = Field(default=120, ge=10, le=600)
    max_retries: int = Field(default=3, ge=0, le=10)
    retry_backoff_seconds: list[int] = Field(default_factory=lambda: [30, 120, 300])

    @field_validator("retry_backoff_seconds")
    @classmethod
    def _validate_backoff(cls, v: list[int]) -> list[int]:
        if any(x < 0 for x in v):
            raise ValueError("retry_backoff_seconds entries must be >= 0")
        return v


class Attempt(BaseModel):
    started_at: str
    ended_at: str
    exit_code: int
    duration_ms: int
    output_tail: str  # last ~2KB of combined stdout+stderr
    success: bool
    error: Optional[str] = None


class RunRecord(BaseModel):
    id: str
    trigger: Literal["schedule", "manual"]
    # Optional link back to the SchedulePoint that fired this run
    point_id: Optional[str] = None
    started_at: str
    ended_at: str
    status: Literal["success", "fail"]
    attempts: list[Attempt]


class StatusResponse(BaseModel):
    enabled: bool
    config: Config
    next_point: Optional[SchedulePoint]  # earliest pending point in the future
    last_run: Optional[RunRecord]
    consecutive_successes: int
    running: bool


class AddSchedulePointRequest(BaseModel):
    # Accept either an absolute ISO (with tz offset), or a local datetime + tz
    scheduled_at: str
