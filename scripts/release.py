#!/usr/bin/env python3
"""Versioning and releases (replaces the former PowerShell scripts; runs anywhere Python does).

    python3 scripts/release.py bump [patch|minor|major] [--no-commit]
        On a feature branch: bump the version in every manifest, re-lock the
        backend workspace and commit. Refuses to run on main.

    python3 scripts/release.py publish [--draft] [--prerelease]
        On a clean, up-to-date main: tag vX.Y.Z and create the GitHub release
        with generated notes. Needs the GitHub CLI (gh).

The version in src/frontend/package.json is the source of truth; the backend
manifests mirror it. `just version` and `just release` wrap these commands.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_OF_TRUTH = ROOT / "src/frontend/package.json"
TOML_MANIFESTS = [
    ROOT / "src/backend/pyproject.toml",
    ROOT / "src/backend/libs/travel_common/pyproject.toml",
    ROOT / "src/backend/services/core_api/pyproject.toml",
    ROOT / "src/backend/services/ai_api/pyproject.toml",
    ROOT / "src/backend/tools/scraper/pyproject.toml",
]
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")


def run(*args: str, check: bool = True, capture: bool = False) -> str:
    result = subprocess.run(  # noqa: S603 — fixed argv, no shell
        args, cwd=ROOT, check=check, text=True, capture_output=capture
    )
    return result.stdout.strip() if capture else ""


def current_branch() -> str:
    return run("git", "rev-parse", "--abbrev-ref", "HEAD", capture=True)


def working_tree_dirty() -> bool:
    return bool(run("git", "status", "--porcelain", capture=True))


def read_version() -> str:
    version = json.loads(SOURCE_OF_TRUTH.read_text())["version"]
    if not SEMVER.match(version):
        sys.exit(f"invalid version {version!r} in {SOURCE_OF_TRUTH.relative_to(ROOT)}")
    return version


def bumped(version: str, part: str) -> str:
    major, minor, patch = (int(x) for x in version.split("."))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def set_version(path: Path, old: str, new: str) -> bool:
    text = path.read_text()
    if path.suffix == ".json":
        updated = text.replace(f'"version": "{old}"', f'"version": "{new}"', 1)
    else:
        updated = re.sub(
            rf'^version = "{re.escape(old)}"',
            f'version = "{new}"',
            text,
            count=1,
            flags=re.M,
        )
    if updated == text:
        return False
    path.write_text(updated)
    return True


def cmd_bump(args: argparse.Namespace) -> int:
    branch = current_branch()
    if branch in {"main", "master"}:
        sys.exit("bump the version on a feature branch, not on main")

    old = read_version()
    new = bumped(old, args.part)
    print(f"{old} -> {new} ({args.part}) on {branch}")

    changed: list[Path] = []
    for path in [SOURCE_OF_TRUTH, *TOML_MANIFESTS]:
        if not path.exists():
            print(f"  skip  {path.relative_to(ROOT)} (missing)")
            continue
        if set_version(path, old, new):
            changed.append(path)
            print(f"  ok    {path.relative_to(ROOT)}")
        else:
            print(f"  warn  {path.relative_to(ROOT)} did not contain version {old}")

    if shutil.which("uv"):
        subprocess.run(["uv", "lock", "--quiet"], cwd=ROOT / "src/backend", check=True)  # noqa: S607
        changed.append(ROOT / "src/backend/uv.lock")
        print("  ok    src/backend/uv.lock re-locked")
    else:
        print("  warn  uv not found: run `uv lock` in src/backend before committing")

    if args.no_commit:
        print("files updated, no commit created (--no-commit)")
        return 0
    run("git", "add", *[str(p.relative_to(ROOT)) for p in changed])
    run("git", "commit", "-q", "-m", f"build: bump version to {new}")
    print("committed. Next: push, open a PR, merge, then `just release`.")
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    if not shutil.which("gh"):
        sys.exit("GitHub CLI (gh) is required: https://cli.github.com/")
    if working_tree_dirty():
        sys.exit("working tree is not clean; commit or stash first")

    branch = current_branch()
    if branch not in {"main", "master"}:
        print(f"switching from {branch} to main")
        run("git", "checkout", "-q", "main")
        branch = "main"
    run("git", "pull", "-q", "origin", branch)

    tag = f"v{read_version()}"
    if run("git", "tag", "-l", tag, capture=True):
        sys.exit(f"tag {tag} already exists; bump the version first (`just version`)")

    gh_args = [
        "gh",
        "release",
        "create",
        tag,
        "--generate-notes",
        "--title",
        f"Release {tag}",
    ]
    if args.draft:
        gh_args.append("--draft")
    if args.prerelease:
        gh_args.append("--prerelease")
    run(*gh_args)
    print(
        run("gh", "release", "view", tag, "--json", "url", "--jq", ".url", capture=True)
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    bump = sub.add_parser("bump", help="bump the version in every manifest and commit")
    bump.add_argument(
        "part", nargs="?", default="patch", choices=["patch", "minor", "major"]
    )
    bump.add_argument("--no-commit", action="store_true")
    bump.set_defaults(func=cmd_bump)

    publish = sub.add_parser(
        "publish", help="tag and create the GitHub release from main"
    )
    publish.add_argument("--draft", action="store_true")
    publish.add_argument("--prerelease", action="store_true")
    publish.set_defaults(func=cmd_publish)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
