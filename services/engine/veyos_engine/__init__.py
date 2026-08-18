"""Veyos arbitration engine.

Pure, deterministic, config-driven. Takes a canonical SignalSnapshot, returns a Decision
with a full trace. No network, no database, no clock, no randomness — see CLAUDE.md.
"""

from .config import Rulebook, RulebookError, load_rulebook
from .engine import decide
from .models import Snapshot

__all__ = ["Snapshot", "Rulebook", "RulebookError", "load_rulebook", "decide"]
__version__ = "0.1.0"
