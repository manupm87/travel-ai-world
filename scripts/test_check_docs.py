"""Regression tests for check_docs.py (TRA-326): run with `just test-scripts`."""

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import check_docs


class CheckDocsTest(unittest.TestCase):
    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.write("justfile", "docs-check:\n    python3 scripts/check_docs.py\n")
        self.write("docs/architecture/adr/README.md", "# ADRs\n")
        patcher = mock.patch.object(check_docs, "REQUIRED", [])
        patcher.start()
        self.addCleanup(patcher.stop)

    def write(self, rel: str, text: str) -> None:
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def run_check(self) -> tuple[int, str]:
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = check_docs.main(self.root)
        return code, out.getvalue()

    def test_clean_tree_passes(self) -> None:
        self.write("AGENTS.md", "Run `just docs-check`.\n")
        self.assertEqual(self.run_check()[0], 0)

    def test_agent_worktrees_are_skipped(self) -> None:
        self.write(
            ".claude/worktrees/zz-fake/AGENTS.md",
            "Run `just migration`, see [gone](nowhere.md).\n",
        )
        code, out = self.run_check()
        self.assertEqual(code, 0, out)

    def test_stale_recipe_in_a_runbook_fails(self) -> None:
        self.write("docs/runbooks/deploy.md", "Run `just migration`.\n")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("docs/runbooks/deploy.md: mentions `just migration`", out)

    def test_stale_recipe_in_a_slash_command_fails(self) -> None:
        self.write(".claude/commands/add-city.md", "Run `just migration`.\n")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn(".claude/commands/add-city.md: mentions `just migration`", out)

    def test_percent_encoded_link_resolves(self) -> None:
        self.write("docs/Guion PJ.md", "# Guion\n")
        self.write("docs/README.md", "See [the brief](Guion%20PJ.md).\n")
        code, out = self.run_check()
        self.assertEqual(code, 0, out)

    def test_broken_percent_encoded_link_fails(self) -> None:
        self.write("docs/README.md", "See [the brief](Missing%20File.md).\n")
        code, out = self.run_check()
        self.assertEqual(code, 1)
        self.assertIn("broken link -> Missing%20File.md", out)


if __name__ == "__main__":
    unittest.main()
