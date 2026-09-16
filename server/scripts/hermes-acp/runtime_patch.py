"""Versioned Hermes source patch, loaded in memory without changing the install."""
import hashlib
import importlib.abc
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parent
_active = False


class PatchedModule(importlib.abc.SourceLoader):
    def __init__(self, path, source):
        self.path, self.source = str(path), source

    def get_filename(self, fullname):
        return self.path

    def get_data(self, path):
        if path != self.path:
            raise OSError(path)
        return self.source


class PatchedModules(importlib.abc.MetaPathFinder):
    def __init__(self, modules):
        self.modules = modules

    def find_spec(self, fullname, path=None, target=None):
        loader = self.modules.get(fullname)
        return importlib.util.spec_from_loader(fullname, loader) if loader else None


def prepare_modules(source, root=ROOT):
    manifest = json.loads((root / "patches/manifest.json").read_text())
    modules = {}
    with tempfile.TemporaryDirectory(prefix="octo-hermes-patch-") as directory:
        target = Path(directory)
        for name, expected in manifest["files"].items():
            data = (source / name).read_bytes()
            if hashlib.sha256(data).hexdigest() != expected:
                raise RuntimeError(f"Unsupported Hermes source: {name}; expected commit {manifest['commit']}")
            (target / name).parent.mkdir(parents=True, exist_ok=True)
            (target / name).write_bytes(data)
        # No repository, symlinks, installed files or user Git overrides in this directory.
        env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
        for check in (["--check"], []):
            result = subprocess.run(["git", "apply", *check, str(root / "patches/client-tools.patch")],
                                    cwd=target, env=env, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError("Hermes client-tools patch could not be applied")
        for name in manifest["files"]:
            modules[name[:-3].replace("/", ".")] = PatchedModule(source / name, (target / name).read_bytes())
        for path in (root / "upstream").rglob("*.py"):
            name = path.relative_to(root / "upstream").as_posix()
            if (source / name).exists():
                raise RuntimeError(f"Hermes extension path already exists: {name}")
            modules[name[:-3].replace("/", ".")] = PatchedModule(path, path.read_bytes())
    return modules


def activate():
    global _active
    if _active:
        return
    if "run_agent" in sys.modules or "acp_adapter.server" in sys.modules:
        raise RuntimeError("Hermes patch must be activated before importing the runtime")
    spec = importlib.util.find_spec("run_agent")
    if spec is None or spec.origin is None:
        raise RuntimeError("Hermes Python environment is required")
    modules = prepare_modules(Path(spec.origin).resolve().parent)
    sys.meta_path.insert(0, PatchedModules(modules))
    _active = True
