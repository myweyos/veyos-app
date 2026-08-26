"""Human-readable decision trace.

    python -m weyos_engine.cli --persona alex --state crash
    python -m weyos_engine.cli --persona alex --state crash --no-elemental
    python -m weyos_engine.cli --snapshot path/to/snapshot.json --json

Exists so a non-engineer can see, in one screen, exactly why the engine said what it said.
That is worth more in an investor or clinical conversation than any dashboard.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from .config import REPO_ROOT, load_rulebook
from .engine import decide
from .models import Snapshot

# Demo personas are shared data, not engine test fixtures — the API and the mobile app build
# screens against the same three subjects. Read the same way config.py reads food-tags.json.
PERSONAS_PATH = REPO_ROOT / "packages" / "demo-fixtures" / "personas.json"


def _strip(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _strip(v) for k, v in value.items() if not k.startswith("$")}
    if isinstance(value, list):
        return [_strip(v) for v in value]
    return value


def _merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(base)
    for key, value in patch.items():
        nested = isinstance(value, dict) and isinstance(out.get(key), dict)
        out[key] = _merge(out[key], value) if nested else value
    return out


def load_persona(name: str, state: str) -> dict[str, Any]:
    personas = json.loads(PERSONAS_PATH.read_text(encoding="utf-8"))
    raw: dict[str, Any] = _strip(personas[name]["calm"])
    if state == "crash":
        raw = _merge(raw, _strip(personas[name]["crash"]))
    return raw


def render(decision: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"state: {decision['state']}   rulebook v{decision['rulebook_version']}"
                 f"   elemental_layer={'on' if decision['elemental_layer_enabled'] else 'OFF'}")
    lines.append("")
    lines.append("fired rules")
    for rule in decision["fired_rules"] or []:
        lines.append(f"  {rule['rule_id']:<5} L{rule['layer']}  {rule['name']}")
        for reason in rule["because"]:
            lines.append(f"          - {reason}")
    if not decision["fired_rules"]:
        lines.append("  (none)")

    activity = decision["activity"]
    lines.append("")
    lines.append(f"activity: {activity['verdict']}  {activity['planned']} -> {activity['prescribed']}"
                 f"  @{activity['location']}  (by {activity['decided_by']})")

    lines.append("")
    lines.append("food")
    for meal in decision["food"]["meals"]:
        items = ", ".join(i["name"] for i in meal["items"]) or "-"
        lines.append(f"  {meal['slot']:<11} {items}")
        for removed in meal["removed"]:
            lines.append(f"              x {removed['name']}  ({removed['rule_id']}: {removed['reason']})")
    lines.append(f"  blocked tags : {', '.join(decision['food']['blocked_tags']) or '-'}")
    lines.append(f"  mandated tags: {', '.join(decision['food']['mandated_tags']) or '-'}")

    if decision["supplements"]:
        lines.append("")
        lines.append("supplements: " + ", ".join(decision["supplements"]))
    if decision["constraints"]:
        lines.append("constraints: " + json.dumps(decision["constraints"]))
    if decision["messages"]:
        lines.append("")
        for message in decision["messages"]:
            lines.append(f"  • {message}")
    if decision["warnings"]:
        lines.append("")
        lines.append("WARNINGS")
        for warning in decision["warnings"]:
            lines.append(f"  ! {warning}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the Weyos arbitration engine")
    parser.add_argument("--persona", choices=["sarah", "james", "alex"])
    parser.add_argument("--state", choices=["calm", "crash"], default="calm")
    parser.add_argument("--snapshot", type=Path, help="path to a SignalSnapshot JSON file")
    parser.add_argument("--no-elemental", action="store_true",
                        help="validated-biometrics-only mode (L1/L2/L5)")
    parser.add_argument("--json", action="store_true", help="emit the raw Decision")
    args = parser.parse_args()

    if args.snapshot:
        raw = _strip(json.loads(args.snapshot.read_text(encoding="utf-8")))
    elif args.persona:
        raw = load_persona(args.persona, args.state)
    else:
        parser.error("give --persona or --snapshot")

    decision = decide(
        Snapshot.from_dict(raw),
        load_rulebook(),
        elemental_layer=False if args.no_elemental else None,
    )
    print(json.dumps(decision, indent=2) if args.json else render(decision))


if __name__ == "__main__":
    main()
