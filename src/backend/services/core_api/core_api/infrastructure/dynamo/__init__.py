"""The single-table DynamoDB adapter of `core_api` (ADR 0023).

`table.py` names the table and its index, `keys.py` builds every key,
`codec.py` turns entities into items and back, and `repositories.py`
implements the domain's ports. No other module of the service imports boto3.
"""
