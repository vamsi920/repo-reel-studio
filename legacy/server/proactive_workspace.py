from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

from proactive_store import PROACTIVE_ROOT, normalize_repo_url, scope_key

_LOCAL_PREFIX = "local://"
_CREDENTIAL_URL_RE = re.compile(r"https://[^:\s]+:[^@\s]+@", re.I)
_GITHUB_TOKEN_RE = re.compile(r"\b(ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b")
_AUTH_HEADER_RE = re.compile(r"Bearer\s+[A-Za-z0-9._\-]+", re.I)


def _run_subprocess(command: list[str], cwd: str, timeout_seconds: int) -> dict[str, Any]:
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


class DiscoveryWorkspaceError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str = "workspace_unavailable",
        status: str = "failed",
        detail: Optional[str] = None,
    ):
        super().__init__(message)
        self.code = code
        self.status = status
        self.detail = detail or message


def sanitize_git_output(text: str, *, limit: int = 500) -> str:
    from proactive_secret_sanitizer import redact_secrets

    return redact_secrets(text, limit=limit)


def _workspace_info(
    workspace_path: Path,
    status: str,
    *,
    source: str,
    head_commit: Optional[str] = None,
    sync_attempt: Optional[str] = None,
    fallback_reason: Optional[str] = None,
    detail: Optional[str] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "workspacePath": str(workspace_path.resolve()),
        "status": status,
        "headCommit": head_commit,
        "source": source,
    }
    if sync_attempt:
        payload["syncAttempt"] = sync_attempt
    if fallback_reason:
        payload["fallbackReason"] = sanitize_git_output(fallback_reason, limit=240)
    if detail:
        payload["detail"] = sanitize_git_output(detail, limit=320)
    return payload


def _resolve_head_commit(workspace: Path) -> Optional[str]:
    if not (workspace / ".git").is_dir():
        return None
    head = _run_subprocess(["git", "rev-parse", "HEAD"], cwd=str(workspace), timeout_seconds=20)
    if head["exitCode"] != 0:
        return None
    value = (head.get("stdout") or "").strip()
    return value or None


def parse_local_repo_source(repo_url: str, project_id: Optional[str] = None) -> Path:
    from proactive_local_repo import LocalRepoError, resolve_local_repo_source_path

    try:
        return resolve_local_repo_source_path(repo_url, project_id=project_id)
    except LocalRepoError as exc:
        raise DiscoveryWorkspaceError(str(exc), code=exc.code) from exc


def cleanup_local_discovery_workspace(repo_url: str, project_id: Optional[str]) -> None:
    from proactive_local_repo import safe_remove_tree

    root = PROACTIVE_ROOT / scope_key(repo_url, project_id) / "workspaces"
    workspace = root / "discovery"
    safe_remove_tree(workspace)


def prepare_local_discovery_workspace(
    repo_url: str,
    project_id: Optional[str],
) -> dict[str, Any]:
    from proactive_local_repo import LocalRepoError, copy_local_repo_snapshot, is_path_within_root, safe_remove_tree

    source = parse_local_repo_source(repo_url, project_id)
    root = PROACTIVE_ROOT / scope_key(repo_url, project_id) / "workspaces"
    workspace = root / "discovery"
    root.mkdir(parents=True, exist_ok=True)

    if workspace.exists():
        if is_path_within_root(workspace, source):
            raise DiscoveryWorkspaceError(
                "Discovery workspace cannot overlap the local repository root",
                code="local_copy_unsafe",
            )
        safe_remove_tree(workspace)

    try:
        copy_stats = copy_local_repo_snapshot(source, workspace)
    except LocalRepoError as exc:
        raise DiscoveryWorkspaceError(str(exc), code=exc.code, status="copy_failed") from exc
    except Exception as exc:
        raise DiscoveryWorkspaceError(
            f"Failed to copy local repository into proactive discovery workspace: {exc}",
            code="local_copy_failed",
            status="copy_failed",
        ) from exc

    head_commit = _resolve_head_commit(workspace) or _resolve_head_commit(source)
    detail = f"Using local repository snapshot from {source}."
    if copy_stats.get("skippedSymlinks"):
        detail = (
            f"{detail} Skipped {copy_stats['skippedSymlinks']} symlink(s) to avoid scanning outside the repo root."
        )
    return _workspace_info(
        workspace,
        "copied",
        source="local",
        head_commit=head_commit,
        detail=detail,
    )


def try_sync_project_cache(
    repo_url: str,
    project_id: str,
    github_token: Optional[str],
) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    from proactive_secret_sanitizer import sanitize_exception_message, transient_github_token

    try:
        from repo_workspace import sync_cached_repo_workspace

        with transient_github_token(github_token):
            synced = sync_cached_repo_workspace(repo_url, project_id, token=github_token)
    except Exception as exc:
        return None, sanitize_exception_message(exc, limit=240)

    workspace_raw = synced.get("workspacePath")
    if not workspace_raw:
        return None, "Project workspace sync returned no workspacePath"

    workspace = Path(str(workspace_raw))
    if not workspace.is_dir():
        return None, f"Project workspace path is missing: {workspace}"

    status = str(synced.get("status") or "synced")
    head_commit = synced.get("headCommit") or _resolve_head_commit(workspace)
    return (
        _workspace_info(
            workspace,
            status,
            source="project_cache",
            head_commit=head_commit,
            sync_attempt="project_cache",
            detail="Using synced per-project workspace cache.",
        ),
        None,
    )


def prepare_scoped_git_discovery_workspace(
    repo_url: str,
    project_id: Optional[str],
    *,
    github_token: Optional[str] = None,
    sync_attempt: Optional[str] = None,
    fallback_reason: Optional[str] = None,
) -> dict[str, Any]:
    from proactive_secret_sanitizer import transient_github_token
    normalized = normalize_repo_url(repo_url)
    if normalized.startswith(_LOCAL_PREFIX):
        raise DiscoveryWorkspaceError(
            "Scoped git discovery does not support local:// repositories",
            code="invalid_repo_url",
        )
    if not (normalized.startswith("https://") or normalized.startswith("http://") or normalized.startswith("git@")):
        raise DiscoveryWorkspaceError(
            "Proactive discovery requires an HTTP(S) or git@ GitHub repository URL",
            code="invalid_repo_url",
            detail="Provide a GitHub https URL, configure a project workspace cache, or use local:// for local repos.",
        )

    root = PROACTIVE_ROOT / scope_key(normalized, project_id) / "workspaces"
    workspace = root / "discovery"
    root.mkdir(parents=True, exist_ok=True)

    git_status = "synced"
    detail_parts: list[str] = []
    with transient_github_token(github_token):
        if workspace.exists() and (workspace / ".git").is_dir():
            pull = _run_subprocess(["git", "pull", "--ff-only"], cwd=str(workspace), timeout_seconds=120)
            if pull["exitCode"] != 0:
                git_status = "recloned"
                detail_parts.append(
                    "Fast-forward pull failed; recloning scoped discovery workspace. "
                    f"{sanitize_git_output(pull['stderr'] or pull['stdout'])}"
                )
                shutil.rmtree(workspace, ignore_errors=True)
        elif workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)

        if not workspace.exists():
            clone = _run_subprocess(
                ["git", "clone", "--depth", "1", normalized, str(workspace)],
                cwd=str(root),
                timeout_seconds=180,
            )
            if clone["exitCode"] != 0:
                message = sanitize_git_output(clone["stderr"] or clone["stdout"] or "git clone failed")
                hint = (
                    "Check repository access, default branch availability, and network connectivity. "
                    "For private GitHub repos, connect a project workspace cache or provide authentication."
                )
                raise DiscoveryWorkspaceError(
                    f"Proactive discovery clone failed: {message}",
                    code="clone_failed",
                    status="clone_failed",
                    detail=hint,
                )
            git_status = "cloned"
            detail_parts.append("Cloned repository into scoped proactive discovery workspace.")

        head_commit = _resolve_head_commit(workspace)
    if not head_commit:
        raise DiscoveryWorkspaceError(
            "Discovery workspace clone succeeded but HEAD could not be resolved",
            code="head_unresolved",
            status=git_status,
        )

    detail = " ".join(part for part in detail_parts if part).strip()
    if fallback_reason:
        prefix = f"Project cache sync failed ({sanitize_git_output(fallback_reason, limit=180)}). "
        detail = prefix + (detail or "Using scoped proactive discovery workspace.")
    elif not detail:
        detail = "Using scoped proactive discovery workspace."

    return _workspace_info(
        workspace,
        git_status,
        source="scoped_git",
        head_commit=head_commit,
        sync_attempt=sync_attempt,
        fallback_reason=fallback_reason,
        detail=detail,
    )


def prepare_discovery_workspace(
    repo_url: str,
    project_id: Optional[str],
    github_token: Optional[str] = None,
) -> dict[str, Any]:
    normalized = normalize_repo_url(repo_url)
    if not normalized:
        raise DiscoveryWorkspaceError("repoUrl is required for proactive discovery", code="missing_repo_url")

    if normalized.startswith(_LOCAL_PREFIX):
        return prepare_local_discovery_workspace(normalized, project_id)

    if project_id and str(project_id).strip():
        cached, failure_reason = try_sync_project_cache(normalized, str(project_id).strip(), github_token)
        if cached:
            return cached
        return prepare_scoped_git_discovery_workspace(
            normalized,
            project_id,
            github_token=github_token,
            sync_attempt="project_cache",
            fallback_reason=failure_reason,
        )

    return prepare_scoped_git_discovery_workspace(normalized, project_id, github_token=github_token)
