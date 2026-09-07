import logging

from travel_common.http.logging import configure_logging


def test_configure_logging_is_idempotent_and_sets_the_level():
    configure_logging("debug")
    configure_logging("warning")

    root = logging.getLogger()
    assert root.level == logging.WARNING
    assert len(root.handlers) == 1, "reconfiguring must not stack handlers"


def test_third_party_loggers_stay_quiet_unless_debugging():
    configure_logging("INFO")
    assert logging.getLogger("httpx").level == logging.WARNING

    configure_logging("DEBUG")
    assert (
        logging.getLogger("httpx").level == logging.WARNING
    )  # untouched, inherits DEBUG
