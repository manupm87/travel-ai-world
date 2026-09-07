"""Identity of the caller, independent of how it was established.

`core_api` builds a Principal from the database; a stateless service can
build one from JWT claims alone. Endpoints only ever see this type, never
an ORM row.
"""

from dataclasses import dataclass
from enum import StrEnum


class Role(StrEnum):
    USER = "user"
    ADMIN = "admin"


@dataclass(frozen=True, slots=True)
class Principal:
    id: int
    email: str
    role: Role = Role.USER

    @property
    def is_admin(self) -> bool:
        return self.role is Role.ADMIN
