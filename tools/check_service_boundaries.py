#!/usr/bin/env python3
"""Enforce monorepo service boundaries (SCRUM-20, AC2).

The invariant: a unit (an app or a service) may import its own source, third-party
dependencies, and the shared TypeScript packages under ``packages/*`` (of which
``@weyos/shared-schema`` is the canonical contract). It may NOT reach into another
unit's source directly -- not by a relative path that escapes its own root, and not
by importing another unit's published package name.

Nothing here reads biometrics or config values; it inspects import specifiers only.
Run with ``python3 tools/check_service_boundaries.py`` (exit 0 = clean, 1 = violations).

Policy is data-driven, defined below, so adding a unit or an allowed edge is an edit
to the tables -- not to the walking logic.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterator
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Directories whose immediate children are independent units (apps and services).
UNIT_PARENTS = ("apps", "services")

# The one permitted service -> service source dependency. engine-http is the HTTP
# sidecar around the pure engine (ADR 0004): it legitimately imports the engine's
# Python package. Everything else must go through a shared package or over HTTP.
# Keyed by unit path relative to the repo root; value is the set of Python top-level
# packages that unit is allowed to import from another unit.
ALLOWED_PYTHON_CROSS_IMPORTS = {
    "services/engine-http": {"weyos_engine"},
}

# Python top-level package names that belong to a unit, so we can tell an internal
# import ("from weyos_engine_http.routes") from a cross-unit one.
PYTHON_PACKAGE_OWNER = {
    "weyos_engine": "services/engine",
    "backtest": "services/engine",
    "demo_driver": "services/engine",
    "weyos_engine_http": "services/engine-http",
}

# Web frameworks the pure engine must never import at the source level (ADR 0004).
# The CI env check proves they are not installed; this proves nobody imports them.
ENGINE_FORBIDDEN_PYTHON = {"fastapi", "uvicorn", "starlette", "httpx", "requests"}

SKIP_DIR_NAMES = {"node_modules", "dist", "build", ".next", "__pycache__", ".venv", "coverage"}

# import ... from "x";  |  export ... from "x";  |  require("x")  |  import("x")
TS_IMPORT_RE = re.compile(
    r"""(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]"""
)
# from x import ...   (one module)
PY_FROM_RE = re.compile(r"""^\s*from\s+([.\w]+)\s+import\b""")
# import a, b.c as d, ...   (the comma-separated tail is parsed per-module below)
PY_IMPORT_RE = re.compile(r"""^\s*import\s+(.+)""")

SOURCE_SUFFIXES = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py")
TS_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}


def discover_units(root: Path) -> list[str]:
    units: list[str] = []
    for parent in UNIT_PARENTS:
        pdir = root / parent
        if not pdir.is_dir():
            continue
        for child in sorted(pdir.iterdir()):
            if child.is_dir() and child.name not in SKIP_DIR_NAMES:
                units.append(f"{parent}/{child.name}")
    return units


def discover_shared_packages(root: Path) -> set[str]:
    """Published package names under packages/* -- the allowed shared layer."""
    names: set[str] = set()
    pkg_root = root / "packages"
    if not pkg_root.is_dir():
        return names
    for child in sorted(pkg_root.iterdir()):
        manifest = child / "package.json"
        if manifest.is_file():
            try:
                name = json.loads(manifest.read_text()).get("name")
            except (OSError, json.JSONDecodeError):
                name = None
            if name:
                names.add(name)
    return names


def iter_source_files(root: Path, units: list[str]) -> Iterator[tuple[str, Path]]:
    for unit in units:
        for path in (root / unit).rglob("*"):
            if path.suffix not in SOURCE_SUFFIXES:
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            yield unit, path


def _strip_ts_comment(line: str) -> str:
    """Return the code portion of a line, dropping a // line-comment.

    Quote-aware so a // inside a string (e.g. a "https://" specifier) is preserved;
    lines that are purely a /* ... */ or * block-comment carry no import and are dropped.
    """
    stripped = line.lstrip()
    if stripped.startswith(("/*", "*")):
        return ""
    quote: str | None = None
    for i in range(len(line) - 1):
        c = line[i]
        if quote:
            if c == quote:
                quote = None
        elif c in "\"'`":
            quote = c
        elif c == "/" and line[i + 1] == "/":
            return line[:i]
    return line


def check_ts(root: Path, unit: str, path: Path, shared_packages: set[str]) -> list[str]:
    violations: list[str] = []
    unit_root = (root / unit).resolve()
    for lineno, raw_line in enumerate(path.read_text().splitlines(), 1):
        line = _strip_ts_comment(raw_line)
        m = TS_IMPORT_RE.search(line)
        if not m:
            continue
        spec = m.group(1)
        if spec.startswith("."):
            # Relative import: resolve and ensure it stays inside this unit.
            target = (path.parent / spec).resolve()
            if unit_root not in target.parents and target != unit_root:
                violations.append(
                    f"{path.relative_to(root)}:{lineno}: relative import "
                    f'"{spec}" escapes {unit}'
                )
        elif spec.startswith("@weyos/"):
            # Cross-unit only via a shared package under packages/*.
            if spec not in shared_packages:
                violations.append(
                    f"{path.relative_to(root)}:{lineno}: import of "
                    f'"{spec}" is not a shared packages/* package'
                )
        # Bare third-party specifiers (react, @nestjs/*, ...) are fine.
    return violations


def _py_imported_tops(line: str) -> list[str]:
    """Top-level package names a Python line imports (empty for relative imports).

    Handles `from x.y import z` (one module) and `import a, b.c as d` (several),
    stripping `as` aliases. Leading-dot (relative) imports stay inside the unit.
    """
    m = PY_FROM_RE.match(line)
    if m:
        raw = m.group(1)
        return [] if raw.startswith(".") else [raw.split(".")[0]]
    m = PY_IMPORT_RE.match(line)
    if not m:
        return []
    tops: list[str] = []
    for part in m.group(1).split(","):
        name = part.strip().split(" as ")[0].strip()
        if not name or name.startswith("."):
            continue
        tops.append(name.split(".")[0])
    return tops


def check_py(root: Path, unit: str, path: Path) -> list[str]:
    violations: list[str] = []
    allowed = ALLOWED_PYTHON_CROSS_IMPORTS.get(unit, set())
    is_engine = unit == "services/engine"
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        for top in _py_imported_tops(line):
            if is_engine and top in ENGINE_FORBIDDEN_PYTHON:
                violations.append(
                    f"{path.relative_to(root)}:{lineno}: engine imports web "
                    f'framework "{top}" (ADR 0004: engine is pure)'
                )
                continue
            owner = PYTHON_PACKAGE_OWNER.get(top)
            if owner and owner != unit and top not in allowed:
                violations.append(
                    f"{path.relative_to(root)}:{lineno}: cross-unit import "
                    f'"{top}" (owned by {owner}); go through a shared package or HTTP'
                )
    return violations


def scan(root: Path) -> list[str]:
    """Return all service-boundary violations found under ``root`` (empty == clean)."""
    units = discover_units(root)
    shared_packages = discover_shared_packages(root)
    violations: list[str] = []
    for unit, path in iter_source_files(root, units):
        if path.suffix == ".py":
            violations.extend(check_py(root, unit, path))
        else:
            violations.extend(check_ts(root, unit, path, shared_packages))
    return violations


def main() -> int:
    units = discover_units(REPO_ROOT)
    violations = scan(REPO_ROOT)

    if violations:
        print("Service boundary violations (SCRUM-20 AC2):", file=sys.stderr)
        for v in sorted(violations):
            print(f"  {v}", file=sys.stderr)
        print(
            f"\n{len(violations)} violation(s). Cross-unit code goes through "
            "packages/shared-schema (or HTTP for the engine), never a direct reach.",
            file=sys.stderr,
        )
        return 1

    print(f"Service boundaries OK: {len(units)} units, no forbidden cross-imports.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
