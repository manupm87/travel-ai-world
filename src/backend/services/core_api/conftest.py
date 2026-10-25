"""Hermetic settings for the test run, applied before any test module imports the app.

Environment variables beat `.env` in pydantic-settings, so a fresh `just setup`
(whose `.env` leaves SECRET_KEY empty) still signs and verifies test tokens.
"""

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-32b")
