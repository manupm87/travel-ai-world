"""`python -m core_api.ops backfill-trip-index`: trips saved before the admin
index (TRA-227) get the GSI2 keys `trip_item` writes today (TRA-230)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from core_api import ops
from core_api.domain.models import Trip
from core_api.infrastructure.dynamo import keys
from core_api.infrastructure.dynamo.backfill import backfill_trip_index
from core_api.infrastructure.dynamo.repositories import DynamoTripRepository
from core_api.infrastructure.dynamo.table import DynamoTable
from travel_common.exceptions import ProviderUnavailable

from tests.conftest import TRIP_CITY


def a_trip(owner: uuid.UUID, created_at: datetime) -> Trip:
    return Trip(user_id=owner, title="t", created_at=created_at, **TRIP_CITY)


def _without_index(table: DynamoTable, trip: Trip) -> None:
    """Make `trip` look like one saved before TRA-227: no GSI2 keys."""
    table.client.update_item(
        TableName=table.name,
        Key=keys.key(keys.user_pk(trip.user_id), keys.trip_sk(trip.id)),
        UpdateExpression="REMOVE GSI2PK, GSI2SK",
    )


def _raw(table: DynamoTable, trip: Trip) -> dict[str, Any]:
    return table.client.get_item(
        TableName=table.name,
        Key=keys.key(keys.user_pk(trip.user_id), keys.trip_sk(trip.id)),
    )["Item"]


def _gsi2(table: DynamoTable, trip: Trip) -> tuple[str | None, str | None]:
    item = _raw(table, trip)
    return (
        item.get(keys.GSI2PK, {}).get("S"),
        item.get(keys.GSI2SK, {}).get("S"),
    )


@pytest.fixture
async def trips(table: DynamoTable) -> tuple[list[Trip], Trip]:
    """Three trips without the GSI2 keys (two owners) and one that has them."""
    repository = DynamoTripRepository(table)
    owner, other = uuid.uuid4(), uuid.uuid4()
    base = datetime(2026, 9, 1, 12, 0, tzinfo=UTC)
    legacy = [
        await repository.add(a_trip(owner, base)),
        await repository.add(a_trip(owner, base + timedelta(hours=1))),
        await repository.add(a_trip(other, base + timedelta(days=1))),
    ]
    for trip in legacy:
        _without_index(table, trip)
    indexed = await repository.add(a_trip(other, base + timedelta(days=2)))
    return legacy, indexed


async def test_every_trip_gets_the_keys_trip_item_writes(
    table: DynamoTable, trips: tuple[list[Trip], Trip]
):
    legacy, indexed = trips
    before = _raw(table, indexed)

    result = await backfill_trip_index(table)

    assert (result.scanned, result.updated, result.skipped) == (3, 3, 0)
    for trip in legacy:
        assert _gsi2(table, trip) == (
            keys.TRIPS_GSI2PK,
            keys.trip_gsi2_sk(trip.created_at, trip.id),
        )
    assert _raw(table, indexed) == before


async def test_the_admin_list_sees_the_backfilled_trips(
    table: DynamoTable, trips: tuple[list[Trip], Trip]
):
    legacy, indexed = trips
    repository = DynamoTripRepository(table)
    listed, _ = await repository.list_all(None, 10)
    assert [summary.id for summary in listed] == [indexed.id]

    await backfill_trip_index(table)

    listed, _ = await repository.list_all(None, 10)
    newest_first = [indexed, *reversed(legacy)]
    assert [summary.id for summary in listed] == [trip.id for trip in newest_first]


async def test_a_dry_run_writes_nothing(
    table: DynamoTable, trips: tuple[list[Trip], Trip]
):
    legacy, _ = trips

    result = await backfill_trip_index(table, dry_run=True)

    assert (result.scanned, result.updated, result.skipped) == (3, 3, 0)
    assert result.summary(dry_run=True) == "scanned=3 would_update=3 skipped=0"
    for trip in legacy:
        assert _gsi2(table, trip) == (None, None)


async def test_a_second_run_changes_nothing(
    table: DynamoTable, trips: tuple[list[Trip], Trip]
):
    await backfill_trip_index(table)

    result = await backfill_trip_index(table)

    assert (result.scanned, result.updated, result.skipped) == (0, 0, 0)


async def test_a_trip_stamped_meanwhile_is_skipped(
    table: DynamoTable,
    trips: tuple[list[Trip], Trip],
    monkeypatch: pytest.MonkeyPatch,
):
    """A save between the scan and the update stamps the trip itself."""
    legacy, _ = trips
    raced = legacy[0]
    real_scan = table.client.scan

    def scan_then_save(**kwargs: Any) -> Any:
        page = real_scan(**kwargs)
        table.client.update_item(
            TableName=table.name,
            Key=keys.key(keys.user_pk(raced.user_id), keys.trip_sk(raced.id)),
            UpdateExpression="SET GSI2PK = :pk, GSI2SK = :sk",
            ExpressionAttributeValues={
                ":pk": {"S": keys.TRIPS_GSI2PK},
                ":sk": {"S": "saved-meanwhile"},
            },
        )
        return page

    monkeypatch.setattr(table.client, "scan", scan_then_save)

    result = await backfill_trip_index(table)

    assert (result.scanned, result.updated, result.skipped) == (3, 2, 1)
    assert _gsi2(table, raced) == (keys.TRIPS_GSI2PK, "saved-meanwhile")


async def test_the_scan_follows_every_page(
    table: DynamoTable,
    trips: tuple[list[Trip], Trip],
    monkeypatch: pytest.MonkeyPatch,
):
    real_scan = table.client.scan
    calls: list[dict[str, Any]] = []

    def one_item_per_page(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return real_scan(**kwargs, Limit=1)

    monkeypatch.setattr(table.client, "scan", one_item_per_page)

    result = await backfill_trip_index(table)

    assert result.updated == 3
    assert len(calls) > 1
    assert "ExclusiveStartKey" in calls[-1]


# ── CLI ──────────────────────────────────────────────────────────────────────


@pytest.fixture
def own_table(table: DynamoTable, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point the CLI at the test table instead of `CORE_TABLE`."""

    async def fake_open_table(_settings: object) -> DynamoTable:
        return table

    monkeypatch.setattr(ops, "open_table", fake_open_table)


@pytest.mark.usefixtures("own_table")
def test_the_cli_prints_the_summary(
    table: DynamoTable,
    trips: tuple[list[Trip], Trip],
    capsys: pytest.CaptureFixture[str],
):
    assert ops.main(["backfill-trip-index", "--dry-run"]) == 0
    assert capsys.readouterr().out == "scanned=3 would_update=3 skipped=0\n"

    assert ops.main(["backfill-trip-index"]) == 0
    assert capsys.readouterr().out == "scanned=3 updated=3 skipped=0\n"

    assert ops.main(["backfill-trip-index"]) == 0
    assert capsys.readouterr().out == "scanned=0 updated=0 skipped=0\n"


def test_the_cli_exits_1_when_dynamodb_refuses(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
):
    async def refused(*, dry_run: bool) -> None:
        raise ProviderUnavailable("DynamoDB: ResourceNotFoundException")

    monkeypatch.setattr(ops, "_backfill_with_own_table", refused)

    assert ops.main(["backfill-trip-index"]) == 1
    captured = capsys.readouterr()
    assert captured.out == ""
    assert "ResourceNotFoundException" in captured.err


async def test_a_missing_table_is_a_domain_error(table: DynamoTable):
    missing = DynamoTable(table.client, "no-such-table")

    with pytest.raises(ProviderUnavailable):
        await backfill_trip_index(missing)
