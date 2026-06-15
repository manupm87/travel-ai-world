"""Add Google OAuth fields to users table

Revision ID: a1b2c3d4e5f6
Revises: e5f41161a19b
Create Date: 2026-05-16 18:20:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "e5f41161a19b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add Google OAuth columns
    op.add_column("users", sa.Column("auth_provider", sa.String(), nullable=False, server_default="local"))
    op.add_column("users", sa.Column("google_id", sa.String(), nullable=True))
    op.add_column("users", sa.Column("name", sa.String(), nullable=True))
    op.add_column("users", sa.Column("picture", sa.String(), nullable=True))

    # Create unique index on google_id
    op.create_index(op.f("ix_users_google_id"), "users", ["google_id"], unique=True)

    # Make hashed_password nullable (OAuth users don't have one)
    op.alter_column("users", "hashed_password", existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Revert hashed_password to non-nullable (set empty string for any nulls first)
    op.execute("UPDATE users SET hashed_password = '' WHERE hashed_password IS NULL")
    op.alter_column("users", "hashed_password", existing_type=sa.String(), nullable=False)

    # Drop Google OAuth columns
    op.drop_index(op.f("ix_users_google_id"), table_name="users")
    op.drop_column("users", "picture")
    op.drop_column("users", "name")
    op.drop_column("users", "google_id")
    op.drop_column("users", "auth_provider")
