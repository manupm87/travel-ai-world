"""Identity of the caller, independent of how it was established.

A verified token yields `Claims`; endpoints only ever see a `Principal`
built from them, never an ORM row. `core_api` extends `Principal` with the
account id it resolves from the database; a stateless service uses it as is.
"""

from dataclasses import dataclass
from enum import StrEnum


class Role(StrEnum):
    USER = "user"
    ADMIN = "admin"


@dataclass(frozen=True, slots=True)
class Principal:
    """Who is calling, as every endpoint sees it.

    `subject` is the stable identifier the token was issued for: the account
    id as text in local mode, the user pool `sub` (a UUID) in Cognito mode.
    """

    subject: str
    email: str
    role: Role = Role.USER

    @property
    def is_admin(self) -> bool:
        return self.role is Role.ADMIN


@dataclass(frozen=True, slots=True)
class Claims:
    """What a verified token says about the caller, whichever mode issued it.

    The profile fields are only present in Cognito ID tokens; local tokens
    carry the `Principal` alone.
    """

    subject: str
    email: str
    role: Role = Role.USER
    name: str = ""
    picture: str | None = None

    @property
    def principal(self) -> Principal:
        return Principal(subject=self.subject, email=self.email, role=self.role)
