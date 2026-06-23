from __future__ import annotations

import unittest

from tests.proactive_test_harness import install_import_stubs

install_import_stubs()

from proactive_discovery_fixture import (  # noqa: E402
    assert_discovery_fixture_expectations,
    discovery_snapshot,
    materialize_discovery_fixture_workspace,
    run_discovery_dry_run,
    write_discovery_fixture,
)
from proactive_candidate_score import SELECT_THRESHOLD  # noqa: E402


class ProactiveDiscoveryFixtureTests(unittest.TestCase):
    def test_fixture_files_cover_signals(self) -> None:
        workspace = materialize_discovery_fixture_workspace()
        self.assertTrue((workspace / "package.json").is_file())
        self.assertIn("TODO", (workspace / "src/util/helpers.ts").read_text(encoding="utf-8"))
        self.assertTrue((workspace / "config/secrets/vault.ts").is_file())
        self.assertFalse((workspace / "src/core/index.test.ts").exists())

    def test_dry_run_discover_score_select(self) -> None:
        workspace = materialize_discovery_fixture_workspace()
        result = run_discovery_dry_run(workspace, target=3)
        assert_discovery_fixture_expectations(result)
        for item in result.selected:
            self.assertGreaterEqual(float(item["score"]["total"]), SELECT_THRESHOLD)

    def test_dry_run_is_deterministic(self) -> None:
        workspace = materialize_discovery_fixture_workspace()
        first = run_discovery_dry_run(workspace, target=3)
        second = run_discovery_dry_run(workspace, target=3)
        self.assertEqual(discovery_snapshot(first), discovery_snapshot(second))

    def test_write_fixture_to_custom_dir(self) -> None:
        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            write_discovery_fixture(root)
            self.assertTrue((root / "src/feature/alpha.ts").is_file())


if __name__ == "__main__":
    unittest.main()
