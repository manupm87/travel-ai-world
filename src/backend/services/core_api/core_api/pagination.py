"""Offset pagination, shared by the API, services and repositories."""

from dataclasses import dataclass

MAX_PAGE_SIZE = 500


@dataclass(frozen=True, slots=True)
class Page:
    skip: int = 0
    limit: int = 100
