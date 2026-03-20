"""
Per-project cached git checkout for Studio + mini-SWE agent runs.

Clone happens once when the user finishes Phase 1 (ensure endpoint).
Agent runs copy/link from this cache into an isolated run workspace instead
of cloning from GitHub again.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

REPO_WORKSPACES_ROOT = Path(__file__).resolve().parent / ".repo-workspaces"

# UUID v4 (and similar) — used as Supabase project id
_PROJECT_ID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _run_cmd(
    command: list[str],
    cwd: str,
    timeout_seconds: int,
) -> dict[str, Any]:
    started = time.time()
    env = os.environ.copy()
    env["CI"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-20000:],
            "stderr": (completed.stderr or "")[-20000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "exitCode": 124,
            "stdout": (exc.stdout or "")[-20000:] if isinstance(exc.stdout, str) else "",
            "stderr": ((exc.stderr or "")[-20000:] if isinstance(exc.stderr, str) else "")
            or f"Timed out after {timeout_seconds}s",
            "durationMs": int((time.time() - started) * 1000),
        }


def validate_project_id(project_id: str) -> str:
    pid = (project_id or "").strip()
    if not _PROJECT_ID_RE.match(pid):
        raise ValueError("projectId must be a UUID")
    return pid


def validate_github_repo_url(repo_url: str) -> str:
    url = (repo_url or "").strip()
    if not url.startswith("https://github.com/") and not url.startswith("http://github.com/"):
        raise ValueError("Only http(s) GitHub repository URLs are supported for workspace cache")
    return url.rstrip("/")


def project_root(project_id: str) -> Path:
    return REPO_WORKSPACES_ROOT / validate_project_id(project_id)


def cached_workspace_path(project_id: str) -> Path:
    return project_root(project_id) / "workspace"


def meta_path(project_id: str) -> Path:
    return project_root(project_id) / "meta.json"


def read_meta(project_id: str) -> Optional[dict[str, Any]]:
    path = meta_path(project_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def write_meta(project_id: str, data: dict[str, Any]) -> None:
    root = project_root(project_id)
    root.mkdir(parents=True, exist_ok=True)
    meta_path(project_id).write_text(json.dumps(data, indent=2), encoding="utf-8")


def ensure_cached_repo_workspace(
    repo_url: str,
    project_id: str,
    branch: Optional[str] = None,
    token: Optional[str] = None,
) -> dict[str, Any]:
    """
    Clone repo once into server/.repo-workspaces/<projectId>/workspace.
    Returns { workspacePath, status: "reused" | "cloned" }.
    """
    repo_url = validate_github_repo_url(repo_url)
    pid = validate_project_id(project_id)

    if token:
        os.environ["GITHUB_TOKEN"] = str(token)

    REPO_WORKSPACES_ROOT.mkdir(parents=True, exist_ok=True)
    ws = cached_workspace_path(pid)
    meta = read_meta(pid)

    reuse = (
        ws.is_dir()
        and (ws / ".git").is_dir()
        and meta
        and meta.get("repoUrl") == repo_url
    )
    # Different branch than cached → refresh checkout
    if reuse and branch and branch != meta.get("branch"):
        reuse = False

    if reuse:
        return {"workspacePath": str(ws.resolve()), "status": "reused"}

    root = project_root(pid)
    if ws.exists():
        shutil.rmtree(ws)
    root.mkdir(parents=True, exist_ok=True)

    parent = str(root)
    clone_res = _run_cmd(
        ["git", "clone", "--depth", "1", repo_url, str(ws)],
        cwd=parent,
        timeout_seconds=300,
    )
    if clone_res["exitCode"] != 0:
        raise RuntimeError(
            clone_res["stderr"] or clone_res["stdout"] or "git clone failed for workspace cache"
        )

    if branch:
        co = _run_cmd(["git", "checkout", branch], cwd=str(ws), timeout_seconds=60)
        if co["exitCode"] != 0:
            shutil.rmtree(ws, ignore_errors=True)
            raise RuntimeError(co["stderr"] or co["stdout"] or "branch checkout failed")

    write_meta(
        pid,
        {
            "repoUrl": repo_url,
            "branch": branch,
            "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )
    return {"workspacePath": str(ws.resolve()), "status": "cloned"}


def get_valid_cache_for_run(project_id: str, repo_url: str) -> Optional[Path]:
    """Return cache path if it exists and matches repo_url."""
    try:
        pid = validate_project_id(project_id)
    except ValueError:
        return None
    url = (repo_url or "").strip().rstrip("/")
    meta = read_meta(pid)
    ws = cached_workspace_path(pid)
    meta_url = (meta.get("repoUrl") or "").strip().rstrip("/") if meta else ""
    if not meta or meta_url != url:
        return None
    if not ws.is_dir() or not (ws / ".git").is_dir():
        return None
    return ws.resolve()


def materialize_run_workspace(
    cache: Path,
    dest: Path,
    repo_url: str,
    branch: Optional[str],
) -> None:
    """
    Create an isolated git working tree for one agent run.
    Prefer git clone --reference-if-able (fast, shares object store).
    Fall back to full directory copy if clone fails.
    """
    dest_parent = dest.parent
    dest_parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        shutil.rmtree(dest)

    ref_res = _run_cmd(
        [
            "git",
            "clone",
            "--depth",
            "1",
            "--reference-if-able",
            str(cache),
            repo_url,
            str(dest),
        ],
        cwd=str(dest_parent),
        timeout_seconds=180,
    )

    if ref_res["exitCode"] != 0 or not (dest / ".git").exists():
        try:
            if dest.exists():
                shutil.rmtree(dest)
            shutil.copytree(cache, dest, symlinks=True, dirs_exist_ok=False)
        except Exception as exc:
            raise RuntimeError(f"Failed to materialize workspace from cache: {exc}") from exc

    if branch:
        co = _run_cmd(["git", "checkout", branch], cwd=str(dest), timeout_seconds=60)
        if co["exitCode"] != 0:
            raise RuntimeError(co["stderr"] or co["stdout"] or "branch checkout failed in run workspace")
