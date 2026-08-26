"""Walk a scripted scenario, or regenerate the committed golden output.

    python -m demo_driver --persona sarah
    python -m demo_driver --all
    python -m demo_driver --generate

Exists so the scripted days can be read in one screen, and so the ``expected/`` fixtures that
both drivers assert against are produced by a command rather than by hand.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from .driver import DEMO_FIXTURES, PERSONA_IDS, DayResult, load_profile, run_scenario, write_expected

EXPECTED_DIR = DEMO_FIXTURES / "expected"


def render(results: list[DayResult]) -> str:
    if not results:
        return "(no days)"
    profile = load_profile(results[0].persona)
    lines = [
        f"{profile['display_name']}  ({profile['region']})  scenario '{results[0].scenario_id}'",
        "",
    ]
    for r in results:
        flag = "  <-- MISMATCH" if r.expect.get("app_state") not in (None, r.app_state) else ""
        lines.append(f"  day {r.day_index}  {r.app_state:<13} engine={r.decision['state']:<21}{flag}")
        lines.append(f"          {r.label}")
        fired = ", ".join(sorted(x["rule_id"] for x in r.decision["fired_rules"])) or "-"
        lines.append(f"          fired: {fired}")
        if r.unevaluable:
            lines.append(f"          unevaluable: {', '.join(r.unevaluable)}")
        activity = r.decision["activity"]
        lines.append(
            f"          activity: {activity['verdict']}  "
            f"{activity['planned']} -> {activity['prescribed']}  @{activity['location']}"
        )
        if r.decision["warnings"]:
            lines.append(f"          warnings: {len(r.decision['warnings'])}")
        lines.append("")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m demo_driver",
        description="Run a scripted demo scenario through the real engine.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--persona", choices=PERSONA_IDS)
    group.add_argument("--all", action="store_true", help="every persona")
    group.add_argument(
        "--generate",
        action="store_true",
        help="regenerate packages/demo-fixtures/expected/ (the two-driver drift guard)",
    )
    parser.add_argument("--out", type=Path, default=EXPECTED_DIR, help="output dir for --generate")
    args = parser.parse_args(argv)

    if args.generate:
        total = 0
        for persona in PERSONA_IDS:
            written = write_expected(args.out, persona)
            total += len(written)
            print(f"{persona}: {len(written)} days -> {args.out / persona}")
        print(f"wrote {total} files")
        return 0

    personas = PERSONA_IDS if args.all else (args.persona,)
    for persona in personas:
        print(render(run_scenario(persona)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
