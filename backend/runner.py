"""Run a single healthcheck against `reclaude` / `claude` with retries."""
from __future__ import annotations

import asyncio
import logging
import shutil
from datetime import datetime, timezone
from time import perf_counter

from .models import Attempt, Config, RunRecord

log = logging.getLogger("healthcheck.runner")

OUTPUT_TAIL_BYTES = 2048


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tail(text: str, limit: int = OUTPUT_TAIL_BYTES) -> str:
    if len(text) <= limit:
        return text
    return "...[truncated]...\n" + text[-limit:]


async def _attempt_once(cfg: Config) -> Attempt:
    started = _iso_now()
    t0 = perf_counter()
    cmd_path = shutil.which(cfg.command)
    if not cmd_path:
        return Attempt(
            started_at=started,
            ended_at=_iso_now(),
            exit_code=127,
            duration_ms=int((perf_counter() - t0) * 1000),
            output_tail="",
            success=False,
            error=f"command not found in PATH: {cfg.command}",
        )

    argv = [cmd_path, *cfg.extra_args, "-p", cfg.prompt]
    log.info("running healthcheck: %s", " ".join(argv))
    try:
        proc = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        try:
            stdout, _ = await asyncio.wait_for(
                proc.communicate(), timeout=cfg.timeout_seconds
            )
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()
            return Attempt(
                started_at=started,
                ended_at=_iso_now(),
                exit_code=-1,
                duration_ms=int((perf_counter() - t0) * 1000),
                output_tail="",
                success=False,
                error=f"timed out after {cfg.timeout_seconds}s",
            )

        output = stdout.decode("utf-8", errors="replace") if stdout else ""
        exit_code = proc.returncode if proc.returncode is not None else -1
        success = exit_code == 0 and (cfg.expected_marker in output)
        err = None
        if not success:
            if exit_code != 0:
                err = f"non-zero exit code: {exit_code}"
            elif cfg.expected_marker not in output:
                err = f"expected marker {cfg.expected_marker!r} not in output"
        return Attempt(
            started_at=started,
            ended_at=_iso_now(),
            exit_code=exit_code,
            duration_ms=int((perf_counter() - t0) * 1000),
            output_tail=_tail(output),
            success=success,
            error=err,
        )
    except Exception as exc:  # subprocess spawn or unexpected
        return Attempt(
            started_at=started,
            ended_at=_iso_now(),
            exit_code=-1,
            duration_ms=int((perf_counter() - t0) * 1000),
            output_tail="",
            success=False,
            error=f"{type(exc).__name__}: {exc}",
        )


async def run_once(cfg: Config, trigger: str = "schedule") -> RunRecord:
    """Execute one healthcheck round, retrying until success or budget exhausted."""
    started = _iso_now()
    attempts: list[Attempt] = []

    max_attempts = cfg.max_retries + 1
    for i in range(max_attempts):
        attempt = await _attempt_once(cfg)
        attempts.append(attempt)
        if attempt.success:
            break
        if i < max_attempts - 1:
            backoff_idx = min(i, len(cfg.retry_backoff_seconds) - 1)
            backoff = cfg.retry_backoff_seconds[backoff_idx] if cfg.retry_backoff_seconds else 0
            log.warning(
                "healthcheck attempt %d/%d failed: %s; sleeping %ds before retry",
                i + 1, max_attempts, attempt.error, backoff,
            )
            if backoff > 0:
                await asyncio.sleep(backoff)

    final_success = attempts[-1].success
    return RunRecord(
        id=started,
        trigger=trigger,  # type: ignore[arg-type]
        started_at=started,
        ended_at=_iso_now(),
        status="success" if final_success else "fail",
        attempts=attempts,
    )
