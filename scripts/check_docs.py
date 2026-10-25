#!/usr/bin/env python3
"""Mechanical documentation checks; the PR template covers the rest.

Required files exist, every ADR has a Status line and an index entry, every `just`
recipe named in an AGENTS.md, CLAUDE.md, slash command or runbook exists, relative
links resolve (percent-decoded, no anchors).
"""

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]

REQUIRED = [
    "README.md",
    "AGENTS.md",
    ".claude/CLAUDE.md",
    "justfile",
    ".github/pull_request_template.md",
    "docs/README.md",
    "docs/architecture/overview.md",
    "docs/architecture/adr/README.md",
    "src/backend/README.md",
    "src/backend/AGENTS.md",
    "src/backend/libs/travel_common/README.md",
    "src/backend/services/core_api/README.md",
    "src/backend/services/core_api/AGENTS.md",
    "src/backend/services/core_api/.env.example",
    "src/backend/services/ai_api/README.md",
    "src/backend/services/ai_api/AGENTS.md",
    "src/backend/services/ai_api/.env.example",
    "src/backend/tools/city_corpus/README.md",
    "src/backend/tools/city_corpus/AGENTS.md",
    "src/frontend/README.md",
    "src/frontend/AGENTS.md",
    "src/frontend/.env.example",
    "infra/README.md",
    "infra/aws/README.md",
    "docs/api/core-api.openapi.json",
    "docs/api/ai-api.openapi.json",
]

# Copies, caches and installs rather than the repository's own docs; `worktrees`
# covers the agent checkouts under .claude/worktrees/.
SKIPPED_PARTS = {".git", ".venv", "node_modules", ".terraform", ".cache", "worktrees"}

LINK_RE = re.compile(r"\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")
JUST_RE = re.compile(r"`just ([a-z][a-z0-9-]*)")
# Recipe header: name, optional parameters (which may carry `=default`), then a
# colon that is not the `:=` of a variable assignment.
RECIPE_RE = re.compile(r"^([a-z][a-z0-9-]*)(?:\s+[^:\n]*)?:(?!=)", re.M)


def main(root: Path = ROOT) -> int:
    problems: list[str] = []

    for rel in REQUIRED:
        if not (root / rel).exists():
            problems.append(f"missing required file: {rel}")

    recipes = set(RECIPE_RE.findall((root / "justfile").read_text()))
    docs = [
        p
        for p in root.rglob("*.md")
        if not SKIPPED_PARTS.intersection(p.relative_to(root).parts)
    ]

    for doc in docs:
        text = doc.read_text(encoding="utf-8")
        rel = doc.relative_to(root)

        if doc.name in {"AGENTS.md", "CLAUDE.md"} or rel.parent.as_posix() in {
            ".claude/commands",
            "docs/runbooks",
        }:
            for recipe in JUST_RE.findall(text):
                if recipe not in recipes:
                    problems.append(
                        f"{rel}: mentions `just {recipe}` which is not a justfile recipe"
                    )

        for target in LINK_RE.findall(text):
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            resolved = (doc.parent / unquote(target)).resolve()
            if not resolved.exists():
                problems.append(f"{rel}: broken link -> {target}")

    adr_dir = root / "docs" / "architecture" / "adr"
    index = (
        (adr_dir / "README.md").read_text() if (adr_dir / "README.md").exists() else ""
    )
    for adr in sorted(adr_dir.glob("[0-9][0-9][0-9][0-9]-*.md")):
        text = adr.read_text(encoding="utf-8")
        if not re.search(r"^\*\*Status:?\*\*|^Status:", text, re.M):
            problems.append(f"{adr.relative_to(root)}: no Status line")
        if adr.name not in index:
            problems.append(f"docs/architecture/adr/README.md: {adr.name} not listed")

    if problems:
        print("Documentation checks failed:")
        for p in problems:
            print(f"  - {p}")
        return 1
    print(
        f"Documentation OK ({len(docs)} markdown files, {len(recipes)} just recipes)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
