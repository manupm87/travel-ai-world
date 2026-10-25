"""Regression tests for .claude/hooks/check-branch-name.sh (TRA-326).

Run with `just test-scripts`. Each case pipes hook JSON into the script: a deny
decision on stdout means denied, no output means allowed.
"""

import json
import shutil
import subprocess
import unittest
from pathlib import Path

HOOK = Path(__file__).resolve().parents[1] / ".claude/hooks/check-branch-name.sh"

DENY = [
    "git checkout -b bad",
    "git checkout -B bad",
    "git checkout -q -b bad origin/main",
    "git switch -c bad",
    "git switch --create bad",
    "git switch --force-create bad",
    "git -C /workspace checkout -b bad",
    "git -C /workspace switch -c bad",
    "git worktree add -b bad ../x",
    "git worktree add -f -B bad ../x main",
    "git worktree add ../x -b bad",
    "git branch bad",
    "git -C /workspace branch bad",
    "git fetch && git switch -c bad origin/main",
]

ALLOW = [
    "git checkout -b feat/TRA-123-trip-list",
    "git switch --create docs/TRA-326-docs-tooling-drift origin/main",
    "git -C /workspace checkout -b fix/TRA-1-x",
    "git worktree add -b feat/TRA-9-a-b ../x origin/main",
    "git worktree add ../x feat/TRA-9-a-b",
    "git worktree list",
    "git checkout main",
    "git switch main",
    "git branch -d old",
    "git branch",
    "git status",
    "ls -la",
]


def decision(command: str) -> str:
    result = subprocess.run(  # noqa: S603
        ["bash", str(HOOK)],  # noqa: S607
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        check=True,
    )
    if not result.stdout.strip():
        return "allow"
    return json.loads(result.stdout)["hookSpecificOutput"]["permissionDecision"]


@unittest.skipUnless(shutil.which("bash") and shutil.which("jq"), "needs bash, jq")
class BranchHookTest(unittest.TestCase):
    def test_bad_names_are_denied(self) -> None:
        for command in DENY:
            with self.subTest(command=command):
                self.assertEqual(decision(command), "deny")

    def test_good_names_and_other_commands_are_allowed(self) -> None:
        for command in ALLOW:
            with self.subTest(command=command):
                self.assertEqual(decision(command), "allow")


if __name__ == "__main__":
    unittest.main()
