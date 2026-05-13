"""Configuration persistence — JSON file under data/."""
from __future__ import annotations

import json
import threading
from pathlib import Path

from .models import Config


class ConfigStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()
        self._cached: Config | None = None

    def load(self) -> Config:
        with self._lock:
            if self._cached is not None:
                return self._cached.model_copy(deep=True)
            if self.path.exists():
                try:
                    raw = json.loads(self.path.read_text(encoding="utf-8"))
                    self._cached = Config.model_validate(raw)
                except (json.JSONDecodeError, ValueError):
                    self._cached = Config()
            else:
                self._cached = Config()
            return self._cached.model_copy(deep=True)

    def save(self, cfg: Config) -> Config:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(cfg.model_dump(), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            self._cached = cfg.model_copy(deep=True)
            return self._cached.model_copy(deep=True)
