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
# from x import ...  |  import x
PY_IMPORT_RE = re.compile(r"""^\s*(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))""")


def discover_units() -> list[str]:
    units: list[str] = []
    for parent in UNIT_PARENTS:
        pdir = REPO_ROOT / parent
        if not pdir.is_dir():
            continue
        for child in sorted(pdir.iterdir()):
            if child.is_dir() and child.name not in SKIP_DIR_NAMES:
                units.append(f"{parent}/{child.name}")
    return units


def discover_shared_packages() -> set[str]:
    """Published package names under packages/* -- the allowed shared layer."""
    names: set[str] = set()
    pkg_root = REPO_ROOT / "packages"
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


def owning_unit(path: Path, units: list[str]) -> str | None:
    rel = path.resolve().relative_to(REPO_ROOT).as_posix()
    for unit in units:
        if rel == unit or rel.startswith(unit + "/"):
            return unit
    return None


def iter_source_files(units: list[str]):
    for unit in units:
        for path in (REPO_ROOT / unit).rglob("*"):
            if path.suffix not in (".ts", ".tsx", ".py"):
                continue
            if any(part in SKIP_DIR_NAMES for part in path.parts):
                continue
            yield unit, path


def check_ts(unit: str, path: Path, shared_packages: set[str]) -> list[str]:
    violations: list[str] = []
    unit_root = (REPO_ROOT / unit).resolve()
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        m = TS_IMPORT_RE.search(line)
        if not m:
            continue
        spec = m.group(1)
        if spec.startswith("."):
            # Relative import: resolve and ensure it stays inside this unit.
            target = (path.parent / spec).resolve()
            if unit_root not in target.parents and target != unit_root:
                violations.append(
                    f"{path.relative_to(REPO_ROOT)}:{lineno}: relative import "
                    f'"{spec}" escapes {unit}'
                )
        elif spec.startswith("@weyos/"):
            # Cross-unit only via a shared package under packages/*.
            if spec not in shared_packages:
                violations.append(
                    f"{path.relative_to(REPO_ROOT)}:{lineno}: import of "
                    f'"{spec}" is not a shared packages/* package'
                )
        # Bare third-party specifiers (react, @nestjs/*, ...) are fine.
    return violations


def check_py(unit: str, path: Path) -> list[str]:
    violations: list[str] = []
    allowed = ALLOWED_PYTHON_CROSS_IMPORTS.get(unit, set())
    is_engine = unit == "services/engine"
    for lineno, line in enumerate(path.read_text().splitlines(), 1):
        m = PY_IMPORT_RE.match(line)
        if not m:
            continue
        module = (m.group(1) or m.group(2) or "").lstrip(".")
        top = module.split(".")[0]
        if not top:
            continue  # purely relative (from . import x) stays inside the unit
        if is_engine and top in ENGINE_FORBIDDEN_PYTHON:
            violations.append(
                f"{path.relative_to(REPO_ROOT)}:{lineno}: engine imports web "
                f'framework "{top}" (ADR 0004: engine is pure)'
            )
            continue
        owner = PYTHON_PACKAGE_OWNER.get(top)
        if owner and owner != unit and top not in allowed:
            violations.append(
                f"{path.relative_to(REPO_ROOT)}:{lineno}: cross-unit import "
                f'"{top}" (owned by {owner}); go through a shared package or HTTP'
            )
    return violations


def main() -> int:
    units = discover_units()
    shared_packages = discover_shared_packages()
    violations: list[str] = []
    for unit, path in iter_source_files(units):
        if path.suffix == ".py":
            violations.extend(check_py(unit, path))
        else:
            violations.extend(check_ts(unit, path, shared_packages))

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
