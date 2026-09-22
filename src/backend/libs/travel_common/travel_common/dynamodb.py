"""The one way every service reaches Amazon DynamoDB (ADR 0023).

- `DynamoSettings`: the two settings a service adds to its settings class by
  inheritance (`class CoreSettings(CommonSettings, DynamoSettings)`).
- `dynamodb_client`: a cached low-level boto3 client. With an endpoint override
  it talks to DynamoDB Local (Compose) or moto (`just dynamodb-local`); without
  one it talks to AWS with the environment's credentials.
- `call`: runs a blocking client method in a worker thread, so async endpoints
  never block the event loop.
- `TableSpec` / `ensure_table`: create a table outside AWS (local, Compose,
  tests). On AWS the tables belong to Terraform.
- `to_item` / `from_item`: plain Python values to DynamoDB's typed attribute
  maps and back.
"""

import asyncio
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from functools import lru_cache
from typing import Any
from uuid import UUID

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.config import Config
from botocore.exceptions import ClientError
from pydantic_settings import BaseSettings

# boto3 clients are built at runtime from service models; no stubs are installed
# (mypy_boto3 is not a dependency), so the client is typed as `Any`.
DynamoDBClient = Any

_RETRIES = Config(retries={"mode": "standard", "max_attempts": 5})


class DynamoSettings(BaseSettings):
    """DynamoDB settings a service mixes into its settings class.

    It declares no `model_config`: the service's `CommonSettings` base supplies
    the env file and case sensitivity.
    """

    # Empty on AWS (the SDK's regional endpoint). Locally: `just dynamodb-local`
    # (http://localhost:8002) or Compose's DynamoDB Local (http://dynamodb:8000).
    DYNAMODB_ENDPOINT_URL: str = ""
    AWS_REGION: str = "eu-west-1"


@lru_cache
def dynamodb_client(
    endpoint_url: str = "", region: str = "eu-west-1"
) -> DynamoDBClient:
    """A low-level DynamoDB client, one per (endpoint, region).

    `endpoint_url` is passed to boto3 only when non-empty, so an empty value
    keeps the SDK's regional AWS endpoint.
    """
    kwargs: dict[str, Any] = {"region_name": region, "config": _RETRIES}
    if endpoint_url:
        kwargs["endpoint_url"] = endpoint_url
    return boto3.client("dynamodb", **kwargs)


async def call[T](fn: Callable[..., T], /, **kwargs: Any) -> T:
    """Run a blocking boto3 call in a worker thread (clients are thread-safe)."""
    return await asyncio.to_thread(fn, **kwargs)


@dataclass(frozen=True)
class TableSpec:
    """A table's key schema: string partition and sort keys, optional GSIs and TTL.

    `gsis` holds `(index_name, pk_attr, sk_attr)` triples.
    """

    name: str
    pk: str = "PK"
    sk: str = "SK"
    gsis: tuple[tuple[str, str, str], ...] = ()
    ttl_attribute: str | None = None

    def create_table_kwargs(self) -> dict[str, Any]:
        """Keyword arguments for `client.create_table` (on-demand billing)."""
        attributes = [self.pk, self.sk]
        for _, gsi_pk, gsi_sk in self.gsis:
            attributes.extend((gsi_pk, gsi_sk))
        unique = list(dict.fromkeys(attributes))
        kwargs: dict[str, Any] = {
            "TableName": self.name,
            "BillingMode": "PAY_PER_REQUEST",
            "AttributeDefinitions": [
                {"AttributeName": name, "AttributeType": "S"} for name in unique
            ],
            "KeySchema": [
                {"AttributeName": self.pk, "KeyType": "HASH"},
                {"AttributeName": self.sk, "KeyType": "RANGE"},
            ],
        }
        if self.gsis:
            kwargs["GlobalSecondaryIndexes"] = [
                {
                    "IndexName": index_name,
                    "KeySchema": [
                        {"AttributeName": gsi_pk, "KeyType": "HASH"},
                        {"AttributeName": gsi_sk, "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
                for index_name, gsi_pk, gsi_sk in self.gsis
            ]
        return kwargs


async def ensure_table(client: DynamoDBClient, spec: TableSpec) -> None:
    """Create `spec`'s table when it does not exist yet; idempotent.

    Call it only when an endpoint override is configured (local, Compose,
    tests). On AWS, Terraform owns the tables and the services never create
    them.
    """
    try:
        await call(client.describe_table, TableName=spec.name)
        return
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") != "ResourceNotFoundException":
            raise
    await call(client.create_table, **spec.create_table_kwargs())
    waiter = client.get_waiter("table_exists")
    await call(waiter.wait, TableName=spec.name)
    if spec.ttl_attribute:
        await call(
            client.update_time_to_live,
            TableName=spec.name,
            TimeToLiveSpecification={
                "Enabled": True,
                "AttributeName": spec.ttl_attribute,
            },
        )


_serializer = TypeSerializer()
_deserializer = TypeDeserializer()


def _normalise(value: Any) -> Any:
    """Turn Python values into ones `TypeSerializer` accepts."""
    if isinstance(value, Mapping):
        return {
            key: _normalise(item) for key, item in value.items() if item is not None
        }
    if isinstance(value, list | tuple):
        return [_normalise(item) for item in value]
    if isinstance(value, bool):
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Enum):
        return _normalise(value.value)
    return value


def _denormalise(value: Any) -> Any:
    """Integral `Decimal`s back to `int`; sets to lists."""
    if isinstance(value, dict):
        return {key: _denormalise(item) for key, item in value.items()}
    if isinstance(value, list | set | frozenset):
        return [_denormalise(item) for item in value]
    if isinstance(value, Decimal) and value == value.to_integral_value():
        exponent = value.as_tuple().exponent
        if isinstance(exponent, int) and exponent >= 0:
            return int(value)
    return value


def to_item(data: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """A DynamoDB item (typed attribute maps) from plain Python values.

    `None` values in dicts are dropped; in lists they become NULL. Floats become
    `Decimal`, dates and datetimes ISO strings, UUIDs strings, enums their value.
    """
    normalised = _normalise(data)
    return {key: _serializer.serialize(value) for key, value in normalised.items()}


def from_item(item: Mapping[str, Any]) -> dict[str, Any]:
    """Plain Python values from a DynamoDB item; integral numbers come back `int`."""
    return {
        key: _denormalise(_deserializer.deserialize(value))
        for key, value in item.items()
    }
