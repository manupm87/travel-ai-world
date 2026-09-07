"""`.env.example` and `CoreSettings` document exactly the same variables."""

from pathlib import Path

from core_api.config import CoreSettings
from travel_common.config import documented_env_keys

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


def test_env_example_matches_settings():
    documented = documented_env_keys(ENV_EXAMPLE.read_text(encoding="utf-8"))
    fields = set(CoreSettings.model_fields)

    assert documented - fields == set(), "documented but not a setting"
    assert fields - documented == set(), "setting but not documented"
