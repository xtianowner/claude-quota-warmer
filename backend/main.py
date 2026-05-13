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

from .config import ConfigStore
from .models import Config, RunRecord, StatusResponse
from .scheduler import HealthcheckScheduler
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


config_store = ConfigStore(CONFIG_PATH)
run_store = RunStore(RUNS_PATH)
scheduler = HealthcheckScheduler(config_store, run_store)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="claude-code-healthcheck",
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
        next_run_at=scheduler.next_run_at(),
        last_run=run_store.last(),
        consecutive_successes=scheduler.consecutive_successes,
        running=scheduler.running,
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
    parser = argparse.ArgumentParser(prog="claude-healthcheck")
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
