"""FastAPI app: REST API + serves built frontend."""
from __future__ import annotations

import argparse
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel

from .config import ConfigStore
from .models import (
    AddSchedulePointRequest,
    Config,
    QuotaSnapshot,
    RunRecord,
    StatusResponse,
)
from .reclaude import AccountDisabled, LoginRequired, ReclaudeError
from .scheduler import HealthcheckScheduler
from .secrets import SecretsStore
from .storage import RunStore

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("HEALTHCHECK_DATA_DIR", PROJECT_ROOT / "data"))
CONFIG_PATH = DATA_DIR / "config.json"
RUNS_PATH = DATA_DIR / "runs.jsonl"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)


SECRETS_PATH = DATA_DIR / "secrets.json"

config_store = ConfigStore(CONFIG_PATH)
run_store = RunStore(RUNS_PATH)
secrets_store = SecretsStore(SECRETS_PATH)
scheduler = HealthcheckScheduler(config_store, run_store, secrets_store=secrets_store)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="claude-quota-warmer",
    version="0.1.0",
    description="Keep your Claude Code 5h quota window warm.",
    lifespan=lifespan,
)

# Permissive CORS for local dev (frontend may run on a different port).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- API ------------------------------------------------------------


@app.get("/api/status", response_model=StatusResponse)
def get_status() -> StatusResponse:
    cfg = config_store.load()
    return StatusResponse(
        enabled=cfg.enabled,
        config=cfg,
        next_point=scheduler.next_point(),
        last_run=run_store.last(),
        consecutive_successes=scheduler.consecutive_successes,
        running=scheduler.running,
        quota_snapshot=scheduler.latest_snapshot,
        reclaude_error=scheduler.reclaude_error,
    )


@app.get("/api/config", response_model=Config)
def get_config() -> Config:
    return config_store.load()


@app.put("/api/config", response_model=Config)
def put_config(cfg: Config) -> Config:
    saved = config_store.save(cfg)
    scheduler.apply_config(saved)
    return saved


@app.post("/api/enable", response_model=Config)
def enable() -> Config:
    cfg = config_store.load()
    cfg.enabled = True
    saved = config_store.save(cfg)
    scheduler.apply_config(saved)
    return saved


@app.post("/api/disable", response_model=Config)
def disable() -> Config:
    cfg = config_store.load()
    cfg.enabled = False
    saved = config_store.save(cfg)
    scheduler.apply_config(saved)
    return saved


@app.post("/api/schedule", response_model=Config)
def add_schedule(req: AddSchedulePointRequest) -> Config:
    try:
        return scheduler.add_point(req.scheduled_at)
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=400, detail=f"invalid datetime: {exc}")


@app.delete("/api/schedule/{point_id}", response_model=Config)
def delete_schedule(point_id: str) -> Config:
    return scheduler.remove_point(point_id)


@app.post("/api/trigger", response_model=RunRecord)
async def trigger() -> RunRecord:
    if scheduler.running:
        raise HTTPException(status_code=409, detail="a healthcheck is already running")
    return await scheduler.trigger_now()


@app.get("/api/runs", response_model=list[RunRecord])
def list_runs(limit: int = 50) -> list[RunRecord]:
    limit = max(1, min(limit, 500))
    return run_store.list_recent(limit=limit)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


# ---------- reclaude (auto mode) ------------------------------------------


class ReclaudeLoginRequest(BaseModel):
    email: str
    password: str


class ReclaudeStatusResponse(BaseModel):
    has_password: bool
    email: str | None
    snapshot: QuotaSnapshot | None
    error: str | None


@app.post("/api/reclaude/login", response_model=ReclaudeStatusResponse)
async def reclaude_login(req: ReclaudeLoginRequest) -> ReclaudeStatusResponse:
    """Validate credentials, persist them, and trigger an immediate poll."""
    try:
        rc_sid = await scheduler.reclaude.login(req.email, req.password)
    except LoginRequired:
        raise HTTPException(status_code=401, detail="invalid email or password")
    except ReclaudeError as exc:
        raise HTTPException(status_code=502, detail=f"reclaude.ai unreachable: {exc}")

    secrets_store.set_password(req.password)
    secrets_store.set_cookie(rc_sid)

    cfg = config_store.load()
    cfg.reclaude_email = req.email
    cfg.mode = "auto_reclaude"  # login implies the user wants auto mode
    config_store.save(cfg)

    # Verify the cookie by pulling a snapshot; surface any account-level issue early.
    try:
        snap = await scheduler.reclaude.get_quota(rc_sid)
        scheduler._latest_snapshot = snap  # noqa: SLF001 — internal sync
        scheduler._reclaude_error = None  # noqa: SLF001
    except AccountDisabled as exc:
        scheduler._reclaude_error = "account_disabled"  # noqa: SLF001
        raise HTTPException(status_code=400, detail=str(exc))
    except (LoginRequired, ReclaudeError) as exc:
        # Cookie was just minted; treat any failure here as a server-side glitch.
        scheduler._reclaude_error = "network"  # noqa: SLF001
        raise HTTPException(status_code=502, detail=f"quota fetch failed: {exc}")

    # Force a resync inline (not fire-and-forget) so this response — and the
    # frontend's follow-up /api/status — already reflect the post-poll state.
    # Otherwise a stale "not_configured" error from the earlier mode-switch
    # poll can linger in the UI for a few seconds after login.
    if cfg.mode == "auto_reclaude":
        await scheduler.poll_reclaude_now()

    return ReclaudeStatusResponse(
        has_password=True,
        email=req.email,
        snapshot=scheduler.latest_snapshot,
        error=scheduler.reclaude_error,
    )


@app.get("/api/reclaude/snapshot", response_model=ReclaudeStatusResponse)
def reclaude_snapshot() -> ReclaudeStatusResponse:
    cfg = config_store.load()
    return ReclaudeStatusResponse(
        has_password=secrets_store.has_password(),
        email=cfg.reclaude_email,
        snapshot=scheduler.latest_snapshot,
        error=scheduler.reclaude_error,
    )


@app.post("/api/reclaude/refresh", response_model=ReclaudeStatusResponse)
async def reclaude_refresh() -> ReclaudeStatusResponse:
    """Force a poll cycle now (don't wait for the 10-min tick)."""
    await scheduler.poll_reclaude_now()
    cfg = config_store.load()
    return ReclaudeStatusResponse(
        has_password=secrets_store.has_password(),
        email=cfg.reclaude_email,
        snapshot=scheduler.latest_snapshot,
        error=scheduler.reclaude_error,
    )


@app.delete("/api/reclaude/credentials", response_model=Config)
def reclaude_logout() -> Config:
    """Clear cookie + password and drop back to manual mode."""
    secrets_store.clear()
    cfg = config_store.load()
    cfg.reclaude_email = None
    cfg.mode = "manual"
    saved = config_store.save(cfg)
    scheduler._latest_snapshot = None  # noqa: SLF001
    scheduler._reclaude_error = None  # noqa: SLF001
    scheduler.apply_config(saved)
    return saved


# ---------- Frontend static (production) ----------------------------------


if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        index = FRONTEND_DIST / "index.html"
        if index.is_file():
            return FileResponse(index)
        raise HTTPException(status_code=404)
else:
    @app.get("/")
    def root_placeholder() -> dict:
        return {
            "message": (
                "Backend running. Frontend not built yet — run "
                "`pnpm install && pnpm build` (or `npm`) inside frontend/, "
                "or use `pnpm dev` for hot reload."
            ),
            "api_docs": "/docs",
        }


# ---------- CLI entrypoint ------------------------------------------------


def run_cli() -> None:
    parser = argparse.ArgumentParser(prog="claude-quota-warmer")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--reload", action="store_true", help="dev mode")
    args = parser.parse_args()

    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    run_cli()
