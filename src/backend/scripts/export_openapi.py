"""Write each service's OpenAPI document to docs/api/.

The frontend generates its TypeScript types from these files, and CI fails
when they drift from the code. Run from the backend workspace root:

    uv run python scripts/export_openapi.py
"""

import json
import sys
from pathlib import Path

from fastapi import FastAPI

REPO_ROOT = Path(__file__).resolve().parents[3]  # src/backend/scripts/ -> repo root
OUT_DIR = REPO_ROOT / "docs" / "api"


def _apps() -> dict[str, FastAPI]:
    from ai_api.main import app as ai_app
    from core_api.main import app as core_app

    return {"core-api": core_app, "ai-api": ai_app}


def main(check: bool = False) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    drifted: list[str] = []
    for name, app in _apps().items():
        target = OUT_DIR / f"{name}.openapi.json"
        rendered = json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"
        if check:
            if not target.exists() or target.read_text(encoding="utf-8") != rendered:
                drifted.append(str(target.relative_to(REPO_ROOT)))
        else:
            # LF everywhere: the platform default is CRLF on Windows.
            target.write_text(rendered, encoding="utf-8", newline="\n")
            print(f"wrote {target.relative_to(REPO_ROOT)}")
    if drifted:
        print("OpenAPI documents are out of date:", *drifted, sep="\n  ")
        print("Run: just contracts")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(check="--check" in sys.argv))
