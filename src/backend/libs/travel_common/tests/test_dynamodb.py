"""travel_common.dynamodb against moto's in-process DynamoDB."""

from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

import pytest
from travel_common.dynamodb import (
    DynamoSettings,
    TableSpec,
    call,
    dynamodb_client,
    ensure_table,
    from_item,
    to_item,
)
from travel_common.testing import mock_dynamodb

TRIP_ID = UUID("0b5c9e0a-4f0e-4c55-9d1e-2d7d3c1a9b10")


class Phase(Enum):
    PLANNING = "planning"


@pytest.fixture(autouse=True)
def _mocked() -> Iterator[None]:
    with mock_dynamodb():
        yield


def test_round_trip_normalises_python_values():
    moment = datetime(2026, 9, 22, 10, 30, tzinfo=UTC)
    data = {
        "PK": "TRIP#1",
        "budget": {"amount": Decimal("12.50"), "rate": 1.5, "note": None},
        "start": date(2026, 9, 22),
        "created_at": moment,
        "id": TRIP_ID,
        "phase": Phase.PLANNING,
        "public": True,
        "days": 3,
        "title": "",
        "stops": [{"name": "Buda Castle", "order": 1}, {"name": "Parliament"}],
        "tags": ("food", None),
        "gone": None,
    }

    item = to_item(data)

    assert "gone" not in item
    assert item["public"] == {"BOOL": True}
    assert item["budget"]["M"]["rate"] == {"N": "1.5"}
    assert "note" not in item["budget"]["M"]
    assert item["tags"] == {"L": [{"S": "food"}, {"NULL": True}]}

    back = from_item(item)
    assert back == {
        "PK": "TRIP#1",
        "budget": {"amount": Decimal("12.50"), "rate": Decimal("1.5")},
        "start": "2026-09-22",
        "created_at": moment.isoformat(),
        "id": str(TRIP_ID),
        "phase": "planning",
        "public": True,
        "days": 3,
        "title": "",
        "stops": [{"name": "Buda Castle", "order": 1}, {"name": "Parliament"}],
        "tags": ["food", None],
    }
    assert type(back["days"]) is int
    assert type(back["stops"][0]["order"]) is int
    assert back["public"] is True


async def test_ensure_table_creates_gsi_and_ttl_once():
    client = dynamodb_client()
    spec = TableSpec(
        name="trips",
        gsis=(("GSI1", "GSI1PK", "GSI1SK"),),
        ttl_attribute="expires_at",
    )

    await ensure_table(client, spec)

    table = client.describe_table(TableName="trips")["Table"]
    assert table["TableStatus"] == "ACTIVE"
    assert table["BillingModeSummary"]["BillingMode"] == "PAY_PER_REQUEST"
    assert [index["IndexName"] for index in table["GlobalSecondaryIndexes"]] == ["GSI1"]
    assert table["GlobalSecondaryIndexes"][0]["Projection"] == {"ProjectionType": "ALL"}
    ttl = client.describe_time_to_live(TableName="trips")["TimeToLiveDescription"]
    assert ttl["TimeToLiveStatus"] == "ENABLED"
    assert ttl["AttributeName"] == "expires_at"

    await ensure_table(client, spec)  # second call: nothing to do

    assert client.list_tables()["TableNames"] == ["trips"]


async def test_call_runs_client_methods_off_the_event_loop():
    client = dynamodb_client()
    await ensure_table(client, TableSpec(name="things"))

    await call(
        client.put_item,
        TableName="things",
        Item=to_item({"PK": "A", "SK": "B", "count": 2}),
    )
    response = await call(
        client.get_item, TableName="things", Key=to_item({"PK": "A", "SK": "B"})
    )

    assert from_item(response["Item"]) == {"PK": "A", "SK": "B", "count": 2}


def test_client_endpoint_override_only_when_given():
    default = dynamodb_client("")
    local = dynamodb_client("http://x:1")

    assert default.meta.endpoint_url == "https://dynamodb.eu-west-1.amazonaws.com"
    assert local.meta.endpoint_url == "http://x:1"
    assert dynamodb_client("http://x:1") is local


def test_settings_defaults():
    settings = DynamoSettings()

    assert settings.AWS_REGION == "eu-west-1"
    assert isinstance(settings.DYNAMODB_ENDPOINT_URL, str)
