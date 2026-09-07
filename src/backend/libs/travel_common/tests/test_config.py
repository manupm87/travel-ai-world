from travel_common.config import CommonSettings, documented_env_keys


def test_documented_env_keys_reads_active_and_commented_lines():
    text = """
# Comment line without an assignment
SECRET_KEY=""
  ALGORITHM="HS256"
# VERSION="1.0.0"
#  ACCESS_TOKEN_EXPIRE_MINUTES="60"
lowercase=ignored
"""
    assert documented_env_keys(text) == {
        "SECRET_KEY",
        "ALGORITHM",
        "VERSION",
        "ACCESS_TOKEN_EXPIRE_MINUTES",
    }


def test_common_settings_have_no_unused_fields():
    """Every shared setting is read by the shared code (CORS, JWT, app metadata)."""
    assert set(CommonSettings.model_fields) == {
        "PROJECT_NAME",
        "VERSION",
        "API_V1_STR",
        "BACKEND_CORS_ORIGINS",
        "SECRET_KEY",
        "ALGORITHM",
        "ACCESS_TOKEN_EXPIRE_MINUTES",
    }
