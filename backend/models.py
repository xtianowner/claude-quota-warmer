"""Pydantic models for config, runs and API responses."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Config(BaseModel):
    """Persisted user-editable configuration."""

    enabled: bool = False
    # Trigger period in seconds. Default = 4h50min, just under the 5h quota window.
    interval_seconds: int = Field(default=4 * 3600 + 50 * 60, ge=60, le=12 * 3600)
    # Command to invoke. Default `reclaude`; can be set to `claude` for vanilla Claude Code.
    command: str = "reclaude"
    # Extra args passed before `-p`; left empty by default.
    extra_args: list[str] = Field(default_factory=list)
    # Prompt body. The expected marker must be a substring of expected response.
    prompt: str = "Claude Code healthcheck: 请只回复 HEALTHCHECK_OK"
    expected_marker: str = "HEALTHCHECK_OK"
    # Per-attempt timeout (seconds).
    timeout_seconds: int = Field(default=120, ge=10, le=600)
    # Retry strategy on failure.
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
    id: str  # ISO timestamp of run start
    trigger: Literal["schedule", "manual"]
    started_at: str
    ended_at: str
    status: Literal["success", "fail"]
    attempts: list[Attempt]


class StatusResponse(BaseModel):
    enabled: bool
    config: Config
    next_run_at: Optional[str]
    last_run: Optional[RunRecord]
    consecutive_successes: int
    running: bool  # is a run currently in flight
