"""Configuration, resolved once at boot.

Paths are explicit rather than inferred. ``weyos_engine.config`` computes ``REPO_ROOT`` as
``Path(__file__).parents[3]``, which is correct in a checkout and nonsense once the package is
installed into ``site-packages`` — so the sidecar passes paths in rather than relying on it.

That matters more than it looks. ``config._known_food_tags()`` returns an EMPTY SET when
``food-tags.json`` is missing, and ``_validate`` then silently skips the controlled-vocabulary
check. A container that forgot to copy the schemas would boot happily with an unvalidated
rulebook. This module refuses to start instead.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from weyos_engine.config import DEFAULT_RULEBOOK, FOOD_TAGS


class ConfigurationError(RuntimeError):
    """The sidecar cannot start. Always fatal — never degrade into serving decisions."""


@dataclass(frozen=True)
class Settings:
    rulebook_path: Path
    food_tags_path: Path
    host: str
    port: int

    @classmethod
    def from_env(cls) -> Settings:
        return cls(
            rulebook_path=Path(os.environ.get("WEYOS_RULEBOOK_PATH", str(DEFAULT_RULEBOOK))),
            food_tags_path=Path(os.environ.get("WEYOS_FOOD_TAGS_PATH", str(FOOD_TAGS))),
            # Loopback by default. The sidecar has no authentication of any kind and must
            # never be published; the API in front of it is the only thing that should reach it.
            host=os.environ.get("WEYOS_ENGINE_HOST", "127.0.0.1"),
            port=int(os.environ.get("WEYOS_ENGINE_PORT", "8000")),
        )

    def validate(self) -> None:
        if not self.rulebook_path.is_file():
            raise ConfigurationError(f"rulebook not found at {self.rulebook_path}")
        if not self.food_tags_path.is_file():
            raise ConfigurationError(
                f"food-tags.json not found at {self.food_tags_path}. Refusing to start: the "
                f"rulebook loader fails OPEN when it is missing, silently skipping the "
                f"controlled-vocabulary check."
            )
