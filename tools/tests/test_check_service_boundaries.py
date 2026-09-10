"""Tests for the service-boundary checker (SCRUM-20, AC2).

A guard that only ever passes on clean code proves nothing. These build a synthetic
repo in a temp dir and assert the checker FLAGS each forbidden pattern and PASSES the
allowed ones -- the regression net for the boundary rule itself.

Stdlib only (unittest), so the CI `Service boundaries` job runs it without a pip install.
"""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

_MODULE_PATH = Path(__file__).resolve().parent.parent / "check_service_boundaries.py"
_spec = importlib.util.spec_from_file_location("check_service_boundaries", _MODULE_PATH)
assert _spec and _spec.loader
boundaries = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(boundaries)


def _write(root: Path, rel: str, text: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _base_repo(root: Path) -> None:
    """A minimal, boundary-clean repo: a shared package plus two units that obey it."""
    _write(root, "packages/shared-schema/package.json", '{"name": "@weyos/shared-schema"}')
    _write(root, "packages/shared-schema/src/index.ts", "export type Decision = { id: string };\n")
    # API (TS) imports only the shared package, and its own source relatively.
    _write(
        root,
        "services/api/src/decision.service.ts",
        'import type { Decision } from "@weyos/shared-schema";\n'
        'import { helper } from "./helper";\n',
    )
    _write(root, "services/api/src/helper.ts", "export const helper = 1;\n")
    # engine-http (Py) imports the engine -- the one allowed cross-unit edge (ADR 0004).
    _write(root, "services/engine/weyos_engine/__init__.py", "VALUE = 1\n")
    _write(
        root,
        "services/engine-http/weyos_engine_http/routes.py",
        "from weyos_engine import VALUE\nfrom . import local\n",
    )
    _write(root, "services/engine-http/weyos_engine_http/local.py", "x = 1\n")


class CleanRepoTest(unittest.TestCase):
    def test_base_repo_has_no_violations(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _base_repo(root)
            result: list[str] = boundaries.scan(root)
            self.assertEqual(result, [])


class ViolationTest(unittest.TestCase):
    def _scan_with(self, rel: str, text: str) -> list[str]:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _base_repo(root)
            _write(root, rel, text)
            result: list[str] = boundaries.scan(root)
            return result

    def test_ts_relative_import_escaping_unit_is_flagged(self) -> None:
        v = self._scan_with(
            "services/api/src/leak.ts",
            'import { Engine } from "../../engine/weyos_engine";\n',
        )
        self.assertTrue(any("escapes services/api" in x for x in v), v)

    def test_ts_non_shared_weyos_package_is_flagged(self) -> None:
        v = self._scan_with(
            "services/api/src/leak.ts",
            'import { x } from "@weyos/engine-internals";\n',
        )
        self.assertTrue(any("not a shared" in x for x in v), v)

    def test_python_cross_unit_import_is_flagged(self) -> None:
        # API reaching into the engine's Python package directly (should use HTTP).
        v = self._scan_with(
            "services/api/tools/leak.py",
            "from weyos_engine import VALUE\n",
        )
        self.assertTrue(any("cross-unit import" in x and "weyos_engine" in x for x in v), v)

    def test_engine_importing_web_framework_is_flagged(self) -> None:
        v = self._scan_with(
            "services/engine/weyos_engine/leak.py",
            "import fastapi\n",
        )
        self.assertTrue(any("ADR 0004" in x for x in v), v)

    def test_comma_separated_python_import_is_flagged(self) -> None:
        # The forbidden module hides after a comma -- must still be caught.
        v = self._scan_with(
            "services/api/tools/leak.py",
            "import os, weyos_engine as eng\n",
        )
        self.assertTrue(any("cross-unit import" in x and "weyos_engine" in x for x in v), v)

    def test_js_file_cross_import_is_flagged(self) -> None:
        # Not just .ts -- a .mjs config reaching across units must be scanned too.
        v = self._scan_with(
            "services/api/scripts/leak.mjs",
            'import { x } from "@weyos/engine-internals";\n',
        )
        self.assertTrue(any("not a shared" in x for x in v), v)

    def test_allowed_edge_is_bounded_to_weyos_engine(self) -> None:
        # engine-http may import weyos_engine, but NOT another engine-owned package.
        v = self._scan_with(
            "services/engine-http/weyos_engine_http/leak.py",
            "from backtest import run\n",
        )
        self.assertTrue(any("cross-unit import" in x and "backtest" in x for x in v), v)


class RobustnessTest(unittest.TestCase):
    """Patterns that look like violations but are not -- guard against false positives."""

    def _scan_with(self, rel: str, text: str) -> list[str]:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            _base_repo(root)
            _write(root, rel, text)
            result: list[str] = boundaries.scan(root)
            return result

    def test_ts_import_inside_a_comment_is_ignored(self) -> None:
        v = self._scan_with(
            "services/api/src/note.ts",
            '// import { x } from "../../engine/weyos_engine";\n'
            'export const ok = 1;\n',
        )
        self.assertEqual(v, [])

    def test_ts_trailing_inline_comment_is_ignored(self) -> None:
        # import-like text after code in a // comment must not trigger a violation.
        v = self._scan_with(
            "services/api/src/trail.ts",
            'export const ok = 1; // import { x } from "../../engine/weyos_engine"\n',
        )
        self.assertEqual(v, [])

    def test_python_relative_import_is_not_treated_as_top_level(self) -> None:
        # `from .weyos_engine import x` is an intra-unit relative import, not a cross-unit
        # reach into the engine package -- the leading dot must keep it internal.
        v = self._scan_with(
            "services/engine-http/weyos_engine_http/sub.py",
            "from .weyos_engine import thing\n",
        )
        self.assertEqual(v, [])


if __name__ == "__main__":
    unittest.main()
