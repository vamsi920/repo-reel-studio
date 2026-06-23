#!/usr/bin/env python3
"""Local:// proactive repository hardening (pass 33/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_discovery_scan import list_repo_files  # noqa: E402
from proactive_local_repo import (  # noqa: E402
    LocalRepoError,
    copy_local_repo_snapshot,
    resolve_local_repo_source_path,
)
from proactive_workspace import prepare_local_discovery_workspace  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        repo = base / "fixture-repo"
        repo.mkdir()
        (repo / "src").mkdir()
        (repo / "src" / "index.ts").write_text("export {};\n", encoding="utf-8")
        outside = base / "outside.txt"
        outside.write_text("nope\n", encoding="utf-8")
        (repo / "vendor").mkdir()
        (repo / "vendor" / "skip.js").write_text("// skip\n", encoding="utf-8")
        (repo / "escape.ts").symlink_to(outside)

        resolved = resolve_local_repo_source_path(f"local://{repo}")
        _assert(resolved == repo.resolve(), "absolute local path should resolve")

        dest = base / "snapshot"
        stats = copy_local_repo_snapshot(resolved, dest)
        _assert((dest / "src" / "index.ts").is_file(), "source file should copy")
        _assert(not (dest / "vendor").exists(), "vendor dir should be ignored")
        _assert(not (dest / "escape.ts").exists(), "external symlink should not copy")
        _assert(stats["skippedSymlinks"] >= 1, "symlink skip should be counted")

        listed = list_repo_files(dest)
        _assert("src/index.ts" in listed, "scanner should list copied file")
        _assert("outside.txt" not in listed, "scanner must not escape root")

        try:
            resolve_local_repo_source_path("local:///path/missing-proactive-local")
            _fail("missing path should raise")
        except LocalRepoError as exc:
            _assert(exc.code == "local_path_missing", "missing path code")

        store = base / "store"
        os.environ["PROACTIVE_STORE_ROOT"] = str(store)
        try:
            info = prepare_local_discovery_workspace(f"local://{repo}", None)
            _assert(info["source"] == "local", "workspace source should be local")
            _assert(Path(info["workspacePath"]).is_dir(), "discovery workspace should exist")
        finally:
            os.environ.pop("PROACTIVE_STORE_ROOT", None)

    print("OK: proactive local repo validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
