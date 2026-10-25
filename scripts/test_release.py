"""Regression tests for release.py (TRA-326): run with `just test-scripts`."""

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import release


def lock_versions(lock: Path) -> tuple[str, str]:
    data = json.loads(lock.read_text())
    return data["version"], data["packages"][""]["version"]


@unittest.skipUnless(shutil.which("npm"), "npm not installed")
class RelockFrontendTest(unittest.TestCase):
    def test_bump_moves_the_lockfile_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            frontend = Path(tmp)
            manifest = frontend / "package.json"
            manifest.write_text(
                json.dumps({"name": "kw-test", "version": "1.2.3", "private": True})
            )
            subprocess.run(
                ["npm", "install", "--package-lock-only", "--no-audit", "--no-fund"],  # noqa: S607
                cwd=frontend,
                check=True,
                capture_output=True,
            )
            lock = frontend / "package-lock.json"
            self.assertEqual(lock_versions(lock), ("1.2.3", "1.2.3"))

            self.assertTrue(release.set_version(manifest, "1.2.3", "1.2.4"))
            self.assertEqual(release.relock_frontend(frontend), lock)
            self.assertEqual(lock_versions(lock), ("1.2.4", "1.2.4"))


if __name__ == "__main__":
    unittest.main()
