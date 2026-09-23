"""The core table: its key schema and the handle the repositories share."""

import logging
from dataclasses import dataclass

from botocore.exceptions import BotoCoreError, ClientError
from travel_common.dynamodb import (
    DynamoDBClient,
    TableSpec,
    call,
    dynamodb_client,
    ensure_table,
)
from travel_common.exceptions import ProviderUnavailable

from core_api.config import CoreSettings

logger = logging.getLogger(__name__)

GSI1 = "GSI1"
GSI2 = "GSI2"


def core_table_spec(name: str) -> TableSpec:
    """`PK`/`SK` strings and two indexes, no TTL: `GSI1` (`GSI1PK`/`GSI1SK`,
    the accounts by email) and `GSI2` (`GSI2PK`/`GSI2SK`, every trip by
    creation time; ADR 0024).

    On AWS Terraform owns the table (`infra/aws/dynamodb.tf`, where GSI2
    projects only the summary fields); this spec only creates it locally, in
    Compose and in tests (`ensure_table`), with every attribute projected.
    A local table created before GSI2 existed keeps its old schema: delete it
    (or restart DynamoDB Local) to get the index.
    """
    return TableSpec(
        name=name,
        gsis=((GSI1, "GSI1PK", "GSI1SK"), (GSI2, "GSI2PK", "GSI2SK")),
    )


@dataclass(frozen=True, slots=True)
class DynamoTable:
    """The low-level client and the table name, built once per process."""

    client: DynamoDBClient
    name: str

    async def ensure(self) -> None:
        """Create the table when it is missing (local, Compose, tests only)."""
        await ensure_table(self.client, core_table_spec(self.name))

    async def ping(self) -> None:
        """Readiness: the table answers. `ProviderUnavailable` when it does not."""
        try:
            await call(self.client.describe_table, TableName=self.name)
        except (BotoCoreError, ClientError, OSError) as exc:
            logger.error("DynamoDB health check failed: %s", exc)
            raise ProviderUnavailable("Database unavailable") from exc


async def open_table(settings: CoreSettings) -> DynamoTable:
    """The core table for this process (ADR 0023).

    With an endpoint override (DynamoDB Local, moto) the table is created
    when missing; on AWS Terraform owns it and the service never creates it.
    """
    client = dynamodb_client(settings.DYNAMODB_ENDPOINT_URL, settings.AWS_REGION)
    table = DynamoTable(client, settings.CORE_TABLE)
    if settings.DYNAMODB_ENDPOINT_URL:
        await table.ensure()
    elif not settings.on_lambda:
        logger.warning(
            "DYNAMODB_ENDPOINT_URL is empty: core_api talks to DynamoDB on AWS "
            "(table %s). Locally, run `just dynamodb-local` and point it there.",
            settings.CORE_TABLE,
        )
    return table
