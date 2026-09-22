"""Who may import what, checked on the source (ADR 0023).

- PostgreSQL survives only as the read side of `copy-from-postgres`:
  `sqlalchemy` and `core_api.legacy_sql` are imported by `legacy_sql/` itself
  and by `ops.py`, nowhere else.
- DynamoDB is reached through the adapter: `boto3`/`botocore` appear only in
  `infrastructure/dynamo/`.
"""

import ast
from collections.abc import Iterator
from pathlib import Path

import core_api

PACKAGE = Path(core_api.__file__).resolve().parent


def _imports(path: Path) -> Iterator[str]:
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            yield node.module
            # `from core_api import legacy_sql` names the package in the alias.
            yield from (f"{node.module}.{alias.name}" for alias in node.names)


def _offenders(roots: tuple[str, ...], allowed: tuple[str, ...]) -> list[str]:
    found = []
    for path in sorted(PACKAGE.rglob("*.py")):
        relative = path.relative_to(PACKAGE).as_posix()
        if relative.startswith(allowed):
            continue
        for module in _imports(path):
            if module.startswith(roots):
                found.append(f"{relative}: {module}")
    return sorted(set(found))


def test_only_the_copy_reads_postgresql():
    offenders = _offenders(
        ("sqlalchemy", "core_api.legacy_sql"), ("legacy_sql/", "ops.py")
    )
    assert offenders == [], offenders


def test_only_the_adapter_talks_to_dynamodb():
    offenders = _offenders(("boto3", "botocore"), ("infrastructure/dynamo/",))
    assert offenders == [], offenders


def test_the_walk_sees_the_package():
    """Guard against a vacuous pass: the walk does find the copy's imports."""
    assert "sqlalchemy" in set(_imports(PACKAGE / "ops.py"))
