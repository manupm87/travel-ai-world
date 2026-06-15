from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Single shared Base for ALL SQLAlchemy models.

    Import this Base in every model file and in Alembic's env.py
    so that all tables are discovered during migrations.

    Uses the SQLAlchemy 2 class-based API for full mypy/pyright support.
    """
