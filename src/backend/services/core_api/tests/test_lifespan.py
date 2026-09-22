"""The app opens the core table on startup; only local endpoints create it."""

import logging

import pytest
from core_api import main
from core_api.config import CoreSettings
from core_api.infrastructure.dynamo.table import DynamoTable, open_table
from core_api.main import app

from tests.conftest import TEST_TABLE


async def test_lifespan_puts_the_table_on_the_app_state(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        main,
        "get_settings",
        lambda: CoreSettings(CORE_TABLE=TEST_TABLE, DYNAMODB_ENDPOINT_URL=""),
    )

    async with app.router.lifespan_context(app):
        table = app.state.table
        assert isinstance(table, DynamoTable)
        assert table.name == TEST_TABLE
        await table.ping()


async def test_the_table_is_created_only_with_an_endpoint_override(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    created: list[str] = []

    async def fake_ensure(self: DynamoTable) -> None:
        created.append(self.name)

    monkeypatch.setattr(DynamoTable, "ensure", fake_ensure)

    with caplog.at_level(logging.WARNING):
        await open_table(CoreSettings(CORE_TABLE="aws", DYNAMODB_ENDPOINT_URL=""))
    assert created == [], "on AWS Terraform owns the table"
    assert "DYNAMODB_ENDPOINT_URL is empty" in caplog.text

    caplog.clear()
    with caplog.at_level(logging.WARNING):
        await open_table(
            CoreSettings(
                CORE_TABLE="aws",
                DYNAMODB_ENDPOINT_URL="",
                AWS_LAMBDA_FUNCTION_NAME="core-api",
            )
        )
    assert "DYNAMODB_ENDPOINT_URL is empty" not in caplog.text, "expected on Lambda"

    await open_table(
        CoreSettings(CORE_TABLE="local", DYNAMODB_ENDPOINT_URL="http://dynamodb:8000")
    )
    assert created == ["local"]


def test_the_default_table_name_cannot_be_a_real_one():
    """Terraform names it `travel-ai-core`; a laptop that forgets the endpoint
    override fails on a missing table instead of writing to production."""
    assert CoreSettings.model_fields["CORE_TABLE"].default == "travel-ai-local-core"
