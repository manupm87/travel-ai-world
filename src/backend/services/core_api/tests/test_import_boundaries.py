"""Who may import what, checked on the source (ADR 0023).

- DynamoDB is reached through the adapter: `boto3`/`botocore` appear only in
  `infrastructure/dynamo/`.
- `core_api.devtools` mints tokens for any account, so nothing in the web
  process imports it.
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
            # `from core_api import devtools` names the module in the alias.
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


def test_only_the_adapter_talks_to_dynamodb():
    offenders = _offenders(("boto3", "botocore"), ("infrastructure/dynamo/",))
    assert offenders == [], offenders


def test_the_service_never_imports_devtools():
    offenders = _offenders(("core_api.devtools",), ("devtools.py",))
    assert offenders == [], offenders


def test_the_walk_sees_the_package():
    """Guard against a vacuous pass: the walk does find the adapter's imports."""
    assert "botocore.exceptions" in set(
        _imports(PACKAGE / "infrastructure" / "dynamo" / "repositories.py")
    )
