"""The caller once core_api has matched it to an account."""

from dataclasses import dataclass
from uuid import UUID

from travel_common.principal import Principal


@dataclass(frozen=True, slots=True, kw_only=True)
class AccountPrincipal(Principal):
    """A `Principal` plus the account id (a UUID) that owns trips and threads.

    Endpoints and services in this service scope every read by `id`; the
    `subject` is what the token said and what a stateless service would see.
    """

    id: UUID
