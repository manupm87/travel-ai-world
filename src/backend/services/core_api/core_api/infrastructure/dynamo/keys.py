"""Every key of the core table, in one place (ADR 0023).

| Item          | PK                      | SK                                   |
|---------------|-------------------------|--------------------------------------|
| Account       | `USER#<user_id>`        | `PROFILE` (GSI1: `USERS` / email)    |
| Email lookup  | `EMAIL#<email, lower>`  | `EMAIL`                              |
| Trip          | `USER#<user_id>`        | `TRIP#<trip_id>`                     |
|               | (GSI2: `TRIPS` / `<created_at µs UTC>#<trip_id>`, the admin list) |
| Access grant  | `ACCESS#<email, lower>` | `ACCESS` (GSI1: `ACCESS` / email)    |
"""

from datetime import UTC, datetime
from uuid import UUID

PK = "PK"
SK = "SK"
GSI1PK = "GSI1PK"
GSI1SK = "GSI1SK"
GSI2PK = "GSI2PK"
GSI2SK = "GSI2SK"

PROFILE = "PROFILE"
EMAIL = "EMAIL"
USERS = "USERS"
TRIPS_GSI2PK = "TRIPS"
TRIP_PREFIX = "TRIP#"
ACCESS = "ACCESS"


def user_pk(user_id: UUID) -> str:
    return f"USER#{user_id}"


def email_pk(email: str) -> str:
    return f"EMAIL#{email.lower()}"


def access_pk(email: str) -> str:
    """The access list is keyed by email (ADR 0026), trimmed and lower-cased."""
    return f"ACCESS#{email.strip().lower()}"


def trip_sk(trip_id: UUID) -> str:
    return f"{TRIP_PREFIX}{trip_id}"


def _stamp(moment: datetime) -> str:
    """Sorts by time: every timestamp is UTC with microseconds, same width."""
    return moment.astimezone(UTC).isoformat(timespec="microseconds")


def trip_gsi2_sk(created_at: datetime, trip_id: UUID) -> str:
    """Every trip, by creation time (ADR 0024): the admin list reads it backwards."""
    return f"{_stamp(created_at)}#{trip_id}"


def key(pk: str, sk: str) -> dict[str, dict[str, str]]:
    """A `Key` argument in DynamoDB's typed form."""
    return {PK: {"S": pk}, SK: {"S": sk}}
