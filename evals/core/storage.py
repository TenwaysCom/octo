"""Immutable published artifacts and atomically replaced incremental records."""
from __future__ import annotations
import hashlib
import json
import os
import re
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
DEFAULT_ARTIFACTS = ROOT / "artifacts"


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix):
    return f"{prefix}_{datetime.now(timezone.utc):%Y%m%d_%H%M%S}_{uuid.uuid4().hex[:8]}"


def locate(root, kind, identifier):
    if not re.fullmatch(r"[a-zA-Z0-9_.-]+", identifier) or identifier in {".", ".."}:
        raise ValueError("Invalid artifact identifier")
    return Path(root) / kind / identifier


def read_json(path):
    return json.loads(Path(path).read_text())


def read_jsonl(path):
    return [json.loads(line) for line in Path(path).read_text().splitlines() if line.strip()]


def atomic_json(path, value):
    atomic_text(path, canonical(value) + "\n")


def atomic_text(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".tmp-")
    try:
        with os.fdopen(fd, "w") as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def write_jsonl(path, values):
    atomic_text(path, "".join(canonical(v) + "\n" for v in values))


@contextmanager
def staging(parent, identifier):
    parent = Path(parent)
    parent.mkdir(parents=True, exist_ok=True)
    import shutil
    tmp = Path(tempfile.mkdtemp(prefix=".pending-", dir=parent))
    try:
        yield tmp
        tmp.rename(parent / identifier)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)


@contextmanager
def lock(path):
    # OS lock is released on crashes; no stale lock cleanup required.
    import fcntl
    path = Path(path)
    with path.open("a+") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Artifact is already being processed") from None
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)
