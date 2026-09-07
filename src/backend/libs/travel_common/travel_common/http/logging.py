"""Process-wide logging, configured once per app.

Uvicorn configures its own loggers; everything the application logs
(`logging.getLogger(__name__)`) needs a handler on the root logger or it is
silently dropped below WARNING. `configure_logging` is idempotent.
"""

import logging

FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"


def configure_logging(level: str = "INFO") -> None:
    logging.basicConfig(level=level.upper(), format=FORMAT, force=True)
    # Third-party chatter stays at WARNING unless the app itself is in DEBUG.
    if level.upper() != "DEBUG":
        for noisy in ("httpx", "httpcore", "sqlalchemy.engine"):
            logging.getLogger(noisy).setLevel(logging.WARNING)
