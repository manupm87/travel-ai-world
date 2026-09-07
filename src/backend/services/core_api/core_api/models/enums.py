"""Closed vocabularies shared by the ORM, the schemas and, through OpenAPI,
the frontend. Stored as plain strings except `TripStatus` (a Postgres enum
that predates this module)."""

import enum


class TripStatus(enum.StrEnum):
    PLANNING = "planning"
    PLANNED = "planned"
    FINISHED = "finished"


class MealType(enum.StrEnum):
    BREAKFAST = "breakfast"
    BRUNCH = "brunch"
    LUNCH = "lunch"
    SNACK = "snack"
    DINNER = "dinner"


class TransportType(enum.StrEnum):
    FLIGHT = "flight"
    TRAIN = "train"
    BUS = "bus"
    FERRY = "ferry"
    CAR = "car"
    TAXI = "taxi"
    METRO = "metro"
    WALK = "walk"
    OTHER = "other"


class TransportCategory(enum.StrEnum):
    OUTBOUND = "outbound"
    RETURN = "return"
    INTERNAL = "internal"
