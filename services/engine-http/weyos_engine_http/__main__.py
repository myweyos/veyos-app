"""``python -m weyos_engine_http`` — run the sidecar.

Binds loopback by default. The service has no authentication of any kind; the API in front of
it is the only thing that should ever reach it.
"""

from __future__ import annotations

import logging

import uvicorn

from .app import create_app
from .settings import Settings


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    settings = Settings.from_env()
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, access_log=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
