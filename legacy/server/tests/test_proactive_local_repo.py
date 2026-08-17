from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from proactive_discovery_scan import list_repo_files
from proactive_local_repo import (
    LocalRepoError,
    copy_local_repo_snapshot,
    is_path_within_root,
    resolve_local_repo_source_path,
    safe_remove_tree,
)
from proactive_workspace import DiscoveryWorkspaceError, prepare_local_discovery_workspace


class ProactiveLocalRepoTests(unittest.TestCase):
    def test_resolve_absolute_local_url(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()
            (root / "src").mkdir()
            (root / "src" / "app.ts").write_text("export {}\n", encoding="utf-8")

            resolved = resolve_local_repo_source_path(f"local://{root}")
            self.assertEqual(resolved, root.resolve())

    def test_missing_path_error_code(self) -> None:
        with self.assertRaises(LocalRepoError) as ctx:
            resolve_local_repo_source_path("local:///tmp/does-not-exist-proactive-xyz")
        self.assertEqual(ctx.exception.code, "local_path_missing")

    def test_copy_ignores_vendor_and_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = base / "repo"
            outside = base / "outside-secret.txt"
            outside.write_text("secret\n", encoding="utf-8")
            source.mkdir()
            (source / "src").mkdir()
            (source / "src" / "ok.ts").write_text("// ok\n", encoding="utf-8")
            (source / "node_modules").mkdir()
            (source / "node_modules" / "pkg.js").write_text("// skip\n", encoding="utf-8")
            (source / "link.ts").symlink_to(outside)

            dest = base / "copy"
            stats = copy_local_repo_snapshot(source, dest)
            self.assertTrue((dest / "src" / "ok.ts").is_file())
            self.assertFalse((dest / "node_modules").exists())
            self.assertFalse((dest / "link.ts").exists())
            self.assertGreaterEqual(stats["skippedSymlinks"], 1)

    def test_scan_stays_inside_workspace_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            workspace = base / "ws"
            outside = base / "outside.ts"
            outside.write_text("// outside\n", encoding="utf-8")
            workspace.mkdir()
            (workspace / "inside.ts").write_text("// inside\n", encoding="utf-8")
            (workspace / "escape.ts").symlink_to(outside)

            files = list_repo_files(workspace)
            self.assertIn("inside.ts", files)
            self.assertNotIn("outside.ts", files)
            self.assertNotIn("escape.ts", files)

    def test_prepare_local_discovery_workspace_fixture(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = Path(tmp) / "store"
            repo = Path(tmp) / "fixture"
            repo.mkdir()
            (repo / "main.py").write_text("print('hi')\n", encoding="utf-8")
            os.environ["PROACTIVE_STORE_ROOT"] = str(store)
            try:
                info = prepare_local_discovery_workspace(f"local://{repo}", None)
                self.assertEqual(info["status"], "copied")
                workspace = Path(info["workspacePath"])
                self.assertTrue((workspace / "main.py").is_file())
                self.assertTrue(is_path_within_root(workspace / "main.py", workspace))
            finally:
                os.environ.pop("PROACTIVE_STORE_ROOT", None)
                safe_remove_tree(store)


if __name__ == "__main__":
    unittest.main()
