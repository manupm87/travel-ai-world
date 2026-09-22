"""Read-only source for `copy-from-postgres`; deleted with RDS in TRA-219.

The PostgreSQL schema as the last Alembic revision left it, and an engine to
read it. Nothing but `core_api.ops` imports this package (a test walks the
code to keep it that way): the service itself stores everything in DynamoDB.
"""
