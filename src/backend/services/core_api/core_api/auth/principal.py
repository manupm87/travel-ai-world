"""The caller once core_api has matched it to an account."""

from dataclasses import dataclass

from travel_common.principal import Principal


@dataclass(frozen=True, slots=True, kw_only=True)
class AccountPrincipal(Principal):
    """A `Principal` plus the `users.id` that owns trips and profiles.

    Endpoints and services in this service scope every query by `id`; the
    `subject` is what the token said and what a stateless service would see.
    """

    id: int
