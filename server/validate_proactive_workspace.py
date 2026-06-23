#!/usr/bin/env python3
"""Discovery workspace preparation checks (pass 05/40)."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest import mock

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_local_repo import copy_local_repo_snapshot  # noqa: E402
from proactive_workspace import (  # noqa: E402
    DiscoveryWorkspaceError,
    parse_local_repo_source,
    prepare_discovery_workspace,
    prepare_local_discovery_workspace,
    prepare_scoped_git_discovery_workspace,
    sanitize_git_output,
    try_sync_project_cache,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def test_sanitize_git_output() -> None:
    redacted = sanitize_git_output("fatal: https://user:ghp_secret@github.com/org/repo.git")
    _assert("ghp_secret" not in redacted, "token should be redacted from git output")
    _assert("***" in redacted, "credentials should be masked")


def test_local_path_validation() -> None:
    try:
        parse_local_repo_source("local:///path/does-not-exist-xyz")
        _fail("missing local path should raise")
    except DiscoveryWorkspaceError as exc:
        _assert(exc.code == "local_path_missing", "expected local_path_missing code")


def test_local_copy_skips_symlink_escape() -> None:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-local-symlink-"))
    try:
        source = tmp_root / "repo"
        outside = tmp_root / "outside.txt"
        outside.write_text("secret", encoding="utf-8")
        source.mkdir()
        (source / "safe.ts").write_text("// ok\n", encoding="utf-8")
        (source / "link.ts").symlink_to(outside)
        dest = tmp_root / "copy"
        stats = copy_local_repo_snapshot(source, dest)
        _assert((dest / "safe.ts").is_file(), "safe file should copy")
        _assert(not (dest / "link.ts").exists(), "symlink must not copy")
        _assert(stats["skippedSymlinks"] >= 1, "should count skipped symlink")
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


def test_local_workspace_copy_with_head() -> None:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-local-ws-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root / "store")
    repo_dir = tmp_root / "repo"
    repo_dir.mkdir()
    init = subprocess.run(["git", "init"], cwd=str(repo_dir), capture_output=True, text=True)
    _assert(init.returncode == 0, "git init failed for local fixture")
    subprocess.run(
        ["git", "commit", "--allow-empty", "-m", "init"],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
        env={**os.environ, "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com"},
    )
    try:
        info = prepare_local_discovery_workspace(f"local://{repo_dir}", None)
        _assert(info["status"] == "copied", "local workspace should be copied")
        _assert(Path(info["workspacePath"]).is_dir(), "workspacePath should exist")
        _assert(info.get("headCommit"), "local workspace should expose headCommit when .git exists")
        _assert(info.get("source") == "local", "source should be local")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)


def test_project_cache_sync_failure_reason() -> None:
    cached, reason = try_sync_project_cache("https://github.com/example/repo", "not-a-uuid", None)
    _assert(cached is None, "invalid projectId should not return cache workspace")
    _assert(reason and "UUID" in reason, "invalid projectId should surface UUID validation error")


def test_project_cache_fallback_is_explicit() -> None:
    fallback_payload = {
        "workspacePath": "/tmp/proactive-discovery",
        "status": "cloned",
        "headCommit": "abc123",
        "source": "scoped_git",
        "syncAttempt": "project_cache",
        "fallbackReason": "projectId must be a UUID",
        "detail": "fallback",
    }
    with mock.patch("proactive_workspace.try_sync_project_cache", return_value=(None, "projectId must be a UUID")):
        with mock.patch(
            "proactive_workspace.prepare_scoped_git_discovery_workspace",
            return_value=fallback_payload,
        ) as scoped:
            info = prepare_discovery_workspace("https://github.com/example/repo", "bad-id", None)
            scoped.assert_called_once()
            _assert(info.get("fallbackReason"), "fallback should include fallbackReason")
            _assert(info.get("syncAttempt") == "project_cache", "fallback should record syncAttempt")


def test_clone_failure_message() -> None:
    pull_fail = {"exitCode": 1, "stdout": "", "stderr": "pull failed"}
    clone_fail = {"exitCode": 128, "stdout": "", "stderr": "fatal: repository not found"}
    head_ok = {"exitCode": 0, "stdout": "abc\n", "stderr": ""}

    def run_side_effect(command, cwd, timeout_seconds):
        cmd = " ".join(command)
        if "pull" in cmd:
            return pull_fail
        if "clone" in cmd:
            return clone_fail
        if "rev-parse" in cmd:
            return head_ok
        return {"exitCode": 0, "stdout": "", "stderr": ""}

    with mock.patch("proactive_workspace._run_subprocess", side_effect=run_side_effect):
        try:
            prepare_scoped_git_discovery_workspace("https://github.com/example/missing", None)
            _fail("clone failure should raise DiscoveryWorkspaceError")
        except DiscoveryWorkspaceError as exc:
            _assert(exc.code == "clone_failed", "clone failures should use clone_failed code")
            _assert(exc.detail and "private GitHub" in exc.detail, "clone failure should include actionable detail")
            _assert("repository not found" in str(exc) or "clone failed" in str(exc).lower(), "stderr should be surfaced")


def main() -> int:
    test_sanitize_git_output()
    test_local_path_validation()
    test_local_copy_skips_symlink_escape()
    test_local_workspace_copy_with_head()
    test_project_cache_sync_failure_reason()
    test_project_cache_fallback_is_explicit()
    test_clone_failure_message()
    print("OK: proactive_workspace validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
