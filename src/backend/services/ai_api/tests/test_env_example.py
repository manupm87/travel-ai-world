"""`.env.example` and `AISettings` document exactly the same variables."""

from pathlib import Path

import pytest
from ai_api.config import AISettings
from travel_common.config import documented_env_keys

ENV_EXAMPLE = Path(__file__).resolve().parents[1] / ".env.example"


def test_env_example_matches_settings():
    documented = documented_env_keys(ENV_EXAMPLE.read_text(encoding="utf-8"))
    fields = set(AISettings.model_fields)

    assert documented - fields == set(), "documented but not a setting"
    assert fields - documented == set(), "setting but not documented"


def test_the_settings_read_the_env_file_of_the_working_directory(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    (tmp_path / ".env").write_text(
        'INTERACTIONS_TABLE="from-the-env-file"\n', encoding="utf-8"
    )
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("INTERACTIONS_TABLE", raising=False)

    assert AISettings().INTERACTIONS_TABLE == "from-the-env-file"
