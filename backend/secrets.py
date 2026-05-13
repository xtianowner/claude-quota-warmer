"""Local-only secrets store — data/secrets.json with 0600 perms.

Holds the reclaude `rc_sid` cookie and the password used to refresh it.
Kept separate from config.json so secrets never end up in API responses or
shared dumps. Read/write is atomic via tmp + os.replace.
"""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Optional


class SecretsStore:
    def __init__(self, path: Path):
        self.path = path
        self._lock = threading.Lock()

    # ---- internals ----------------------------------------------------

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    def _save(self, data: dict) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        try:
            os.chmod(tmp, 0o600)
        except OSError:
            pass
        os.replace(tmp, self.path)
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    # ---- public -------------------------------------------------------

    def get_cookie(self) -> Optional[str]:
        with self._lock:
            return self._load().get("rc_sid") or None

    def set_cookie(self, rc_sid: str) -> None:
        with self._lock:
            data = self._load()
            data["rc_sid"] = rc_sid
            self._save(data)

    def get_password(self) -> Optional[str]:
        with self._lock:
            return self._load().get("password") or None

    def set_password(self, password: str) -> None:
        with self._lock:
            data = self._load()
            data["password"] = password
            self._save(data)

    def has_password(self) -> bool:
        return self.get_password() is not None

    def clear(self) -> None:
        with self._lock:
            if self.path.exists():
                try:
                    self.path.unlink()
                except OSError:
                    pass
