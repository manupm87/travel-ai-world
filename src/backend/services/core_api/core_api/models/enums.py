"""Closed vocabularies shared by the ORM, the schemas and, through OpenAPI,
the frontend, all stored as plain strings.

A trip's phase is not one of them: it is derived from its dates, never
stored, and lives with the entity it describes (`models/trip.py`, ADR 0019).
"""

import enum


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


class ChatRole(enum.StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
