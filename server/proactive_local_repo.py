from __future__ import annotations

import os
import shutil
import stat
from pathlib import Path, PurePosixPath
from typing import Callable, Optional
from urllib.parse import parse_qs, unquote, urlparse

from proactive_discovery_scan import SCAN_EXCLUDED_DIR_NAMES

LOCAL_PREFIX = "local://"
LOCAL_FOLDER_HOST = "folder"

# Directory names skipped when copying local repos into discovery workspaces.
LOCAL_COPY_IGNORE_DIR_NAMES = frozenset(
    SCAN_EXCLUDED_DIR_NAMES
    | {
        ".DS_Store",
        "tmp",
        "temp",
        "logs",
    }
)

LOCAL_COPY_IGNORE_FILE_NAMES = frozenset(
    {
        ".DS_Store",
        "Thumbs.db",
    }
)


class LocalRepoError(ValueError):
    def __init__(self, message: str, *, code: str = "invalid_local_path"):
        super().__init__(message)
        self.code = code


def normalize_local_repo_url(repo_url: str) -> str:
    return (repo_url or "").strip().rstrip("/")


def _looks_like_filesystem_path(raw: str) -> bool:
    text = raw.strip()
    if not text:
        return False
    if text.startswith(("/", "~", ".")):
        return True
    # Windows drive paths (best-effort; dev machines only).
    if len(text) >= 3 and text[1] == ":" and text[2] in {"/", "\\"}:
        return True
    return False


def _scope_local_folder_path(repo_url: str, project_id: Optional[str]) -> Optional[Path]:
    if not project_id or not str(project_id).strip():
        return None
    from proactive_store import PROACTIVE_ROOT, scope_key

    parsed = urlparse(normalize_local_repo_url(repo_url))
    if parsed.scheme != "local" or (parsed.hostname or "").lower() != LOCAL_FOLDER_HOST:
        return None
    params = parse_qs(parsed.query or "")
    names = params.get("name") or []
    if not names:
        return None
    folder_name = unquote(str(names[0]).strip())
    if not folder_name:
        return None
    safe_name = PurePosixPath(folder_name.replace("\\", "/")).name
    if not safe_name or safe_name in {".", ".."}:
        return None
    candidate = PROACTIVE_ROOT / scope_key(repo_url, project_id) / "local-repo" / safe_name
    if candidate.is_dir():
        return candidate.resolve()
    return None


def resolve_local_repo_source_path(
    repo_url: str,
    *,
    project_id: Optional[str] = None,
) -> Path:
    """
    Resolve a local:// repo URL to an absolute directory on disk.

    Supported forms:
    - local:///abs/path/to/repo
    - local:///Users/me/project (three slashes)
    - local://./relative/from-cwd
  - local://folder?name=my-app (requires materialized scope copy under proactive store)
    """
    normalized = normalize_local_repo_url(repo_url)
    if not normalized.startswith(LOCAL_PREFIX):
        raise LocalRepoError("Repository URL is not a local:// path", code="invalid_local_url")

    raw = normalized[len(LOCAL_PREFIX) :].strip()
    if not raw:
        raise LocalRepoError(
            "local:// is missing a filesystem path (example: local:///Users/me/project)",
            code="invalid_local_url",
        )

    parsed = urlparse(normalized)
    if parsed.scheme == "local" and (parsed.hostname or "").lower() == LOCAL_FOLDER_HOST:
        scoped = _scope_local_folder_path(normalized, project_id)
        if scoped:
            return scoped
        name = ""
        params = parse_qs(parsed.query or "")
        if params.get("name"):
            name = unquote(str(params["name"][0]))
        raise LocalRepoError(
            f"Local folder project '{name or 'unknown'}' is not materialized on the proactive backend. "
            "Use local:///absolute/path for dispatch, or register the folder under the project scope.",
            code="local_folder_not_materialized",
        )

    if _looks_like_filesystem_path(raw):
        source = Path(raw).expanduser()
    else:
        # local://my-repo-name → treat remainder as path segment under cwd.
        source = Path(raw).expanduser()

    try:
        resolved = source.resolve()
    except OSError as exc:
        raise LocalRepoError(f"Could not resolve local repository path: {exc}", code="invalid_local_path") from exc

    if not resolved.exists():
        raise LocalRepoError(
            f"Local repository path does not exist: {resolved}",
            code="local_path_missing",
        )
    if not resolved.is_dir():
        raise LocalRepoError(
            f"Local repository path is not a directory: {resolved}",
            code="local_path_not_dir",
        )
    return resolved


def is_path_within_root(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def should_skip_copy_segment(name: str) -> bool:
    return name in LOCAL_COPY_IGNORE_DIR_NAMES or name in LOCAL_COPY_IGNORE_FILE_NAMES


def safe_remove_tree(path: Path) -> None:
    if not path.exists():
        return
    resolved = path.resolve()

    def _onerror(func: Callable[..., object], p: str, exc_info: object) -> None:
        try:
            os.chmod(p, stat.S_IWUSR | stat.S_IRUSR)
            func(p)
        except OSError:
            pass

    shutil.rmtree(resolved, onerror=_onerror)


def copy_local_repo_snapshot(source: Path, destination: Path) -> dict[str, int]:
    """
    Copy source tree into destination without following symlinks.
    Refuses to copy paths that would escape the resolved source root.
    """
    source_root = source.resolve()
    dest_root = destination.resolve()
    if not source_root.is_dir():
        raise LocalRepoError(f"Local repository path is not a directory: {source_root}", code="local_path_not_dir")

    if dest_root.exists():
        if is_path_within_root(dest_root, source_root):
            raise LocalRepoError(
                "Refusing to copy local repository into its own subtree",
                code="local_copy_unsafe",
            )
        safe_remove_tree(dest_root)

    dest_root.mkdir(parents=True, exist_ok=True)
    copied_files = 0
    skipped_symlinks = 0
    skipped_outside = 0

    for dirpath, dirnames, filenames in os.walk(source_root, topdown=True, followlinks=False):
        current = Path(dirpath)
        try:
            rel_dir = current.relative_to(source_root)
        except ValueError:
            continue

        dirnames[:] = [
            name
            for name in dirnames
            if not should_skip_copy_segment(name) and not (current / name).is_symlink()
        ]

        rel_dest_dir = dest_root / rel_dir
        rel_dest_dir.mkdir(parents=True, exist_ok=True)

        for name in filenames:
            src = current / name
            if src.is_symlink():
                skipped_symlinks += 1
                continue
            try:
                rel_file = src.relative_to(source_root)
            except ValueError:
                skipped_outside += 1
                continue
            if not is_path_within_root(source_root / rel_file, source_root):
                skipped_outside += 1
                continue
            if should_skip_copy_segment(name):
                continue
            target = dest_root / rel_file
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target, follow_symlinks=False)
            copied_files += 1

    return {
        "copiedFiles": copied_files,
        "skippedSymlinks": skipped_symlinks,
        "skippedOutsideRoot": skipped_outside,
    }


def materialize_scoped_local_folder(
    repo_url: str,
    project_id: str,
    source: Path,
) -> Path:
    """Persist a folder snapshot for local://folder?name=... repos under the proactive scope."""
    from proactive_store import PROACTIVE_ROOT, scope_key

    parsed = urlparse(normalize_local_repo_url(repo_url))
    params = parse_qs(parsed.query or "")
    names = params.get("name") or []
    folder_name = PurePosixPath(unquote(str(names[0] if names else "folder")).replace("\\", "/")).name
    if not folder_name:
        raise LocalRepoError("local://folder URL is missing name=", code="invalid_local_url")

    target_root = (PROACTIVE_ROOT / scope_key(repo_url, project_id) / "local-repo" / folder_name).resolve()
    if target_root.exists() and is_path_within_root(target_root, source.resolve()):
        raise LocalRepoError("Refusing to materialize folder into its own subtree", code="local_copy_unsafe")
    copy_local_repo_snapshot(source, target_root)
    return target_root
