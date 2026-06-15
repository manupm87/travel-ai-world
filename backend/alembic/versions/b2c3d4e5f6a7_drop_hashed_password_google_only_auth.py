"""Drop hashed_password column — Google-only auth

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-16 20:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop the legacy password column — auth is now exclusively Google OAuth
    op.drop_column("users", "hashed_password")

    # Update auth_provider default from 'local' to 'google'
    op.alter_column(
        "users",
        "auth_provider",
        server_default="google",
        existing_type=sa.String(),
        existing_nullable=False,
    )

    # Migrate any existing 'local' users to 'google'
    op.execute("UPDATE users SET auth_provider = 'google' WHERE auth_provider = 'local'")


def downgrade() -> None:
    # Re-add hashed_password column (nullable, since it was optional for OAuth users)
    op.add_column("users", sa.Column("hashed_password", sa.String(), nullable=True))

    # Revert auth_provider default
    op.alter_column(
        "users",
        "auth_provider",
        server_default="local",
        existing_type=sa.String(),
        existing_nullable=False,
    )
