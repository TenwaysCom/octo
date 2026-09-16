#!/usr/bin/env python3
"""Compile every Python source file in the repository."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def compile_all_python_files() -> bool:
    """Compile every Python source file without importing or executing it."""
    errors: list[str] = []
    paths = sorted(path for path in ROOT.rglob("*.py") if ".git" not in path.parts)

    for path in paths:
        try:
            compile(path.read_bytes(), str(path), "exec")
        except (OSError, SyntaxError, UnicodeError, ValueError) as error:
            errors.append(f"{path.relative_to(ROOT)}: {error}")

    if errors:
        print("Python syntax check failed:", file=sys.stderr)
        print("\n".join(errors), file=sys.stderr)
        return False

    print(f"Python syntax check passed ({len(paths)} files).")
    return True


def main() -> int:
    syntax_ok = compile_all_python_files()
    return 0 if syntax_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
