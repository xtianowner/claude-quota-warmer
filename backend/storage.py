"""Run-history persistence — JSONL append-only file."""
from __future__ import annotations

import json
import threading
from collections import deque
from pathlib import Path
from typing import Iterable

from .models import RunRecord


class RunStore:
    def __init__(self, path: Path, max_keep: int = 500):
        self.path = path
        self.max_keep = max_keep
        self._lock = threading.Lock()

    def append(self, record: RunRecord) -> None:
        with self._lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record.model_dump(), ensure_ascii=False) + "\n")
            self._maybe_truncate()

    def _maybe_truncate(self) -> None:
        if not self.path.exists():
            return
        # Cheap line-count guard; only rewrite when significantly over.
        with self.path.open("r", encoding="utf-8") as f:
            lines = f.readlines()
        if len(lines) <= int(self.max_keep * 1.5):
            return
        kept = lines[-self.max_keep:]
        with self.path.open("w", encoding="utf-8") as f:
            f.writelines(kept)

    def list_recent(self, limit: int = 50) -> list[RunRecord]:
        if not self.path.exists():
            return []
        with self._lock:
            with self.path.open("r", encoding="utf-8") as f:
                tail: Iterable[str] = deque(f, maxlen=limit)
        out: list[RunRecord] = []
        for line in tail:
            line = line.strip()
            if not line:
                continue
            try:
                out.append(RunRecord.model_validate_json(line))
            except ValueError:
                continue
        out.reverse()  # newest first
        return out

    def last(self) -> RunRecord | None:
        recent = self.list_recent(limit=1)
        return recent[0] if recent else None
