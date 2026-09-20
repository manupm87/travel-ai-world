"""single-city trips with derived phase (TRA-196)

Revision ID: 9d3400b9db7a
Revises: d1233b71daef
Create Date: 2026-09-20 21:31:05.462701

One trip is one city (ADR 0019). The city moves from the `destinations` table
onto the trip itself, `status` disappears in favour of a phase derived from
the dates, and the rows the planner saves keep the card they were made from.

The data step runs before the structure is taken away, in this order:

1. the four demo trips are deleted by title — the seed that wrote them is
   gone, and they are multi-city fiction;
2. every trip that does not have exactly one destination is deleted: with
   none there is no city to give it, with several it is not this app's trip
   any more, and both would fail the NOT NULL columns below;
3. what is left copies its one destination onto the trip, `city_slug` being
   the city name lower-cased with anything else turned into a dash;
4. `part_of_day` is derived from the wall-clock `time` each row already had.

All of it is plain SQL (`op.execute`): a migration that imported the models
would break the day the models move on. It is safe on an empty database and
safe to re-run — every statement is a delete or an overwrite of rows the
previous ones left behind.

The downgrade restores the *structure* only: `destinations`, `status` and
its enum type come back empty, and nothing puts the cities back in them.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9d3400b9db7a"
down_revision: str | None = "d1233b71daef"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


DEMO_TRIP_TITLES = (
    "Grand European Tour: Paris, Rome & Barcelona",
    "Japan Explorer: Traditions & Neon",
    "New York Weekend",
    "Prague, Vienna & Budapest",
)
"""What `core_api.seed` used to load, deleted here with the seed itself."""

TRIP_STATUS_VALUES = ("PLANNING", "PLANNED", "FINISHED")

CITY_SLUG = """
    trim(BOTH '-' FROM left(
        trim(BOTH '-' FROM regexp_replace(lower(d.city), '[^a-z]+', '-', 'g')),
        100
    ))
"""
"""`Budapest` → `budapest`, `New York` → `new-york`, never empty (see below)."""

PART_OF_DAY = """
    CASE
        WHEN "time" < '12:00' THEN 'morning'
        WHEN "time" < '18:00' THEN 'afternoon'
        WHEN "time" < '21:00' THEN 'evening'
        ELSE 'night'
    END
"""
"""The planner's four slots, from the "HH:MM" the row already carried."""


def upgrade() -> None:
    # ── The trip's own city, and what the planner picked, first as nullable ──
    op.add_column("trips", sa.Column("city_slug", sa.String(length=100), nullable=True))
    op.add_column("trips", sa.Column("city", sa.String(length=150), nullable=True))
    op.add_column("trips", sa.Column("country", sa.String(length=150), nullable=True))
    op.add_column(
        "trips", sa.Column("country_code", sa.String(length=3), nullable=True)
    )
    op.add_column("trips", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("lng", sa.Float(), nullable=True))
    op.add_column("trips", sa.Column("origin", sa.String(length=150), nullable=True))
    op.add_column("trips", sa.Column("budget_tier", sa.SmallInteger(), nullable=True))

    for table in ("accommodations", "activities", "meals"):
        op.add_column(
            table, sa.Column("source_ref", sa.String(length=255), nullable=True)
        )
        op.add_column(
            table,
            sa.Column("card", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        )
        op.create_index(
            op.f(f"ix_{table}_source_ref"), table, ["source_ref"], unique=False
        )
    for table in ("activities", "meals"):
        op.add_column(
            table, sa.Column("part_of_day", sa.String(length=16), nullable=True)
        )

    # ── Data ────────────────────────────────────────────────────────────────
    # (a) The demo trips. Children go with them (the foreign keys cascade).
    titles = ", ".join(f"'{title.replace(chr(39), chr(39) * 2)}'" for title in DEMO_TRIP_TITLES)  # fmt: skip
    op.execute(f"DELETE FROM trips WHERE title IN ({titles})")  # noqa: S608

    # (b) Anything multi-city, or with no city at all: there is no single city
    #     to give it, and the columns below do not accept "none".
    op.execute(
        """
        DELETE FROM trips t
        WHERE (SELECT count(*) FROM destinations d WHERE d.trip_id = t.id) <> 1
        """
    )

    # (c) The one destination becomes the trip's city.
    op.execute(
        f"""
        UPDATE trips t SET
            city = d.city,
            country = d.country,
            country_code = d.country_code,
            lat = d.lat,
            lng = d.lng,
            city_slug = COALESCE(NULLIF({CITY_SLUG}, ''), 'unknown')
        FROM destinations d
        WHERE d.trip_id = t.id
        """
    )

    # (d) Where in the day each row sits, from the time it already had.
    for table in ("activities", "meals"):
        op.execute(
            f"""
            UPDATE {table} SET part_of_day = {PART_OF_DAY} WHERE "time" IS NOT NULL
            """  # noqa: S608
        )

    # ── Now the city is mandatory ───────────────────────────────────────────
    for column in ("city_slug", "city", "country", "country_code"):
        op.alter_column("trips", column, nullable=False)
    op.create_index(op.f("ix_trips_city_slug"), "trips", ["city_slug"], unique=False)

    # ── And the multi-city structure goes ───────────────────────────────────
    op.drop_index(op.f("ix_itinerary_days_destination_id"), table_name="itinerary_days")
    op.drop_constraint(
        op.f("itinerary_days_destination_id_fkey"), "itinerary_days", type_="foreignkey"
    )
    op.drop_column("itinerary_days", "destination_id")
    op.drop_index(op.f("ix_destinations_id"), table_name="destinations")
    op.drop_index(op.f("ix_destinations_trip_id"), table_name="destinations")
    op.drop_table("destinations")

    op.drop_column("trips", "status")
    op.execute("DROP TYPE IF EXISTS tripstatus")


def downgrade() -> None:
    """Put the structure back, empty: no city returns to a destination row."""
    values = ", ".join(f"'{value}'" for value in TRIP_STATUS_VALUES)
    op.execute(f"CREATE TYPE tripstatus AS ENUM ({values})")
    op.add_column(
        "trips",
        sa.Column(
            "status",
            postgresql.ENUM(*TRIP_STATUS_VALUES, name="tripstatus", create_type=False),
            server_default="PLANNING",
            nullable=False,
        ),
    )

    op.create_table(
        "destinations",
        sa.Column("id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("trip_id", sa.UUID(), autoincrement=False, nullable=False),
        sa.Column("city", sa.VARCHAR(length=150), autoincrement=False, nullable=False),
        sa.Column(
            "country", sa.VARCHAR(length=150), autoincrement=False, nullable=False
        ),
        sa.Column(
            "country_code", sa.VARCHAR(length=3), autoincrement=False, nullable=False
        ),
        sa.Column(
            "lat", sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True
        ),
        sa.Column(
            "lng", sa.DOUBLE_PRECISION(precision=53), autoincrement=False, nullable=True
        ),
        sa.Column("arrival_date", sa.DATE(), autoincrement=False, nullable=True),
        sa.Column("departure_date", sa.DATE(), autoincrement=False, nullable=True),
        sa.Column("nights_staying", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            postgresql.TIMESTAMP(timezone=True),
            server_default=sa.text("now()"),
            autoincrement=False,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["trip_id"],
            ["trips.id"],
            name=op.f("destinations_trip_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("destinations_pkey")),
    )
    op.create_index(op.f("ix_destinations_trip_id"), "destinations", ["trip_id"])
    op.create_index(op.f("ix_destinations_id"), "destinations", ["id"])
    op.add_column(
        "itinerary_days",
        sa.Column("destination_id", sa.UUID(), autoincrement=False, nullable=True),
    )
    op.create_foreign_key(
        op.f("itinerary_days_destination_id_fkey"),
        "itinerary_days",
        "destinations",
        ["destination_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_itinerary_days_destination_id"), "itinerary_days", ["destination_id"]
    )

    op.drop_index(op.f("ix_trips_city_slug"), table_name="trips")
    for column in (
        "budget_tier",
        "origin",
        "lng",
        "lat",
        "country_code",
        "country",
        "city",
        "city_slug",
    ):
        op.drop_column("trips", column)
    for table in ("activities", "meals"):
        op.drop_column(table, "part_of_day")
    for table in ("accommodations", "activities", "meals"):
        op.drop_index(op.f(f"ix_{table}_source_ref"), table_name=table)
        op.drop_column(table, "card")
        op.drop_column(table, "source_ref")
