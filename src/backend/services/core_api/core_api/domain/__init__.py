"""The domain: plain Python entities, their rules and the repository ports.

Nothing here knows about HTTP, Pydantic or storage. Services work on these
objects through the protocols in `ports.py`; the DynamoDB adapter in
`core_api.infrastructure.dynamo` implements them (ADR 0023).
"""
