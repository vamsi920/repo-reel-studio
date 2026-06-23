#!/usr/bin/env python3
"""Discovery scan boundary checks (pass 06/40)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_discovery_scan import (  # noqa: E402
    SCAN_MAX_FILE_BYTES,
    filter_scannable_source_files,
    is_scannable_source_file,
    list_repo_files,
    path_has_excluded_segment,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> int:
    _assert(path_has_excluded_segment("node_modules/pkg/index.js"), "node_modules should be excluded")
    _assert(path_has_excluded_segment("dist/assets/app.js"), "dist should be excluded")
    _assert(not path_has_excluded_segment("src/app/index.ts"), "src paths should be allowed")

    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-scan-"))
    try:
        workspace = tmp_root / "repo"
        _write(workspace / "src" / "app.ts", "export const ok = true;\n")
        _write(workspace / "node_modules" / "dep.js", "export const dep = 1;\n")
        _write(workspace / "dist" / "bundle.js", "export const bundle = 1;\n")
        (workspace / "assets").mkdir(parents=True, exist_ok=True)
        (workspace / "assets" / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00")

        listed = list_repo_files(workspace)
        _assert("src/app.ts" in listed, "src file should be listed")
        _assert(all("node_modules" not in path for path in listed), "node_modules must be excluded from listing")
        _assert(all("/dist/" not in f"/{path}/" for path in listed), "dist must be excluded from listing")

        huge = workspace / "src" / "huge.ts"
        huge.write_bytes(b"//" + b"x" * (SCAN_MAX_FILE_BYTES + 1))
        _write(workspace / "src" / "small.py", "TODO: fix\n")
        binary = workspace / "src" / "data.bin"
        binary.write_bytes(b"\x00\x01\x02")

        scannable = filter_scannable_source_files(workspace, list_repo_files(workspace))
        _assert("src/app.ts" in scannable, "normal source file should be scannable")
        _assert("src/small.py" in scannable, "python source should be scannable")
        _assert("src/huge.ts" not in scannable, "huge files should be filtered out")
        _assert("src/data.bin" not in scannable, "binary files should be filtered out")
        _assert(not is_scannable_source_file(workspace, "assets/logo.png"), "png should not be scannable")

        link_target = workspace / "src" / "real.ts"
        _write(link_target, "export const linked = 1;\n")
        broken = workspace / "src" / "broken-link.ts"
        try:
            broken.symlink_to(workspace / "missing.ts")
        except OSError:
            broken = None
        if broken:
            listed_with_link = list_repo_files(workspace)
            _assert("src/real.ts" in listed_with_link, "symlink target file should remain listable")

        git_repo = tmp_root / "git-repo"
        git_repo.mkdir()
        _write(git_repo / "src" / "main.ts", "// TODO: cleanup\n")
        _write(git_repo / "vendor" / "lib.go", "package vendor\n")
        subprocess.run(["git", "init"], cwd=str(git_repo), check=True, capture_output=True)
        subprocess.run(["git", "add", "."], cwd=str(git_repo), check=True, capture_output=True)
        subprocess.run(
            ["git", "commit", "-m", "init"],
            cwd=str(git_repo),
            check=True,
            capture_output=True,
            env={
                **os.environ,
                "GIT_AUTHOR_NAME": "t",
                "GIT_AUTHOR_EMAIL": "t@example.com",
                "GIT_COMMITTER_NAME": "t",
                "GIT_COMMITTER_EMAIL": "t@example.com",
            },
        )
        git_listed = list_repo_files(git_repo)
        _assert("src/main.ts" in git_listed, "git ls-files should include tracked src file")
        _assert(all("vendor" not in path for path in git_listed), "vendor must be excluded from git listing")

        print("OK: proactive_discovery_scan validation passed")
        return 0
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
