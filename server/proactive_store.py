from __future__ import annotations

import errno
import hashlib
import json
import os
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator, Optional

from proactive_config import normalize_config_record, validate_config_patch

try:
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None  # type: ignore[assignment]


_DEFAULT_PROACTIVE_ROOT = Path(__file__).resolve().parent / ".proactive-agent-ops"
PROACTIVE_ROOT = _DEFAULT_PROACTIVE_ROOT
STORE_LOCK = threading.RLock()

_JSON_RECORD_SUFFIX = ".json"
_SKIP_GLOB_NAMES = {".corrupt", "workspaces"}
ACTIVE_BATCH_STATUSES = frozenset({"queued", "discovering", "scoring", "materializing"})
TERMINAL_BATCH_STATUSES = frozenset({"complete", "failed", "cancelled"})


def store_root() -> Path:
    override = os.environ.get("PROACTIVE_STORE_ROOT", "").strip()
    if override:
        return Path(override).expanduser().resolve()
    return _DEFAULT_PROACTIVE_ROOT


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def today_key() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())


def normalize_repo_url(repo_url: str) -> str:
    return (repo_url or "").strip().rstrip("/")


def scope_key(repo_url: str, project_id: Optional[str] = None) -> str:
    raw = f"{normalize_repo_url(repo_url)}::{(project_id or '').strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def default_config(repo_url: str, project_id: Optional[str] = None) -> dict[str, Any]:
    return {
        "repoUrl": normalize_repo_url(repo_url),
        "projectId": project_id,
        "enabled": False,
        "targetCount": 6,
        "qualityMode": "high",
        "timezone": time.tzname[0] if time.tzname else "local",
        "morningDeadline": "09:00",
        "updatedAt": now_iso(),
    }


def _sort_key_text(value: Any) -> str:
    return str(value or "")


def _batch_sort_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return (
        _sort_key_text(item.get("createdAt")),
        _sort_key_text(item.get("updatedAt")),
        _sort_key_text(item.get("id")),
    )


def _candidate_sort_key(item: dict[str, Any]) -> tuple[float, str, str]:
    score = item.get("score")
    total_raw = score.get("total", 0) if isinstance(score, dict) else 0
    try:
        total = float(total_raw)
    except (TypeError, ValueError):
        total = 0.0
    return (total, _sort_key_text(item.get("createdAt")), _sort_key_text(item.get("id")))


def _is_record_json_path(path: Path) -> bool:
    name = path.name
    if not name.endswith(_JSON_RECORD_SUFFIX):
        return False
    if name.endswith(".tmp") or ".tmp." in name:
        return False
    if name.startswith("."):
        return False
    return True


def _scope_root_for_path(path: Path) -> Path:
    parent = path.parent
    if parent.name in ("batches", "candidates", "workspaces"):
        return parent.parent
    return parent


def _recover_scope_layout(scope_root: Path) -> None:
    scope_root.mkdir(parents=True, exist_ok=True)
    for child in ("batches", "candidates", "workspaces"):
        (scope_root / child).mkdir(parents=True, exist_ok=True)
    (scope_root / ".corrupt").mkdir(parents=True, exist_ok=True)


def ensure_scope(repo_url: str, project_id: Optional[str] = None) -> Path:
    root = store_root() / scope_key(repo_url, project_id)
    _recover_scope_layout(root)
    return root


@contextmanager
def dispatch_scope_lock(repo_url: str, project_id: Optional[str] = None) -> Iterator[Path]:
    """Serialize dispatch entry for a repo/project scope (in-process + cross-process)."""
    scope = ensure_scope(repo_url, project_id)
    with STORE_LOCK:
        with _scope_file_lock(scope):
            yield scope


@contextmanager
def _scope_file_lock(scope_root: Path) -> Iterator[None]:
    if fcntl is None:
        yield
        return
    _recover_scope_layout(scope_root)
    lock_path = scope_root / ".store.lock"
    with open(lock_path, "a+b") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _quarantine_corrupt_file(path: Path) -> None:
    if not path.exists():
        return
    scope_root = _scope_root_for_path(path)
    corrupt_dir = scope_root / ".corrupt"
    corrupt_dir.mkdir(parents=True, exist_ok=True)
    stamp = now_iso().replace(":", "").replace("-", "")
    backup = corrupt_dir / f"{path.stem}.{stamp}.{uuid.uuid4().hex[:8]}.json"
    try:
        path.replace(backup)
    except OSError:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass


def _parse_json_object(raw: str, path: Path) -> Optional[dict[str, Any]]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _quarantine_corrupt_file(path)
        return None
    if not isinstance(parsed, dict):
        _quarantine_corrupt_file(path)
        return None
    return parsed


def _read_json(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file() or not _is_record_json_path(path):
        return None
    scope_root = _scope_root_for_path(path)
    try:
        with STORE_LOCK:
            with _scope_file_lock(scope_root):
                raw = path.read_text(encoding="utf-8")
    except OSError:
        return None
    parsed = _parse_json_object(raw, path)
    if parsed is None:
        return None
    from proactive_secret_sanitizer import strip_sensitive_fields

    return strip_sensitive_fields(parsed)


def _write_json(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    from proactive_secret_sanitizer import strip_sensitive_fields

    path.parent.mkdir(parents=True, exist_ok=True)
    scope_root = _scope_root_for_path(path)
    safe_payload = strip_sensitive_fields(payload)
    serialized = json.dumps(safe_payload, indent=2, sort_keys=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")

    with STORE_LOCK:
        with _scope_file_lock(scope_root):
            fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
            try:
                os.write(fd, serialized.encode("utf-8"))
                os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(temp, path)
            try:
                dir_fd = os.open(path.parent, os.O_DIRECTORY)
            except OSError as exc:
                # Some filesystems (e.g. certain network mounts) do not support
                # opening a directory for fsync; those specific errnos are safe
                # to ignore. Any other OSError is unexpected and must propagate
                # rather than be silently swallowed.
                if exc.errno not in (errno.ENOTDIR, errno.EOPNOTSUPP, errno.ENOSYS):
                    raise
            else:
                try:
                    os.fsync(dir_fd)
                finally:
                    os.close(dir_fd)

    return payload


def _iter_record_paths(directory: Path) -> list[Path]:
    if not directory.is_dir():
        if directory.name in ("batches", "candidates", "workspaces"):
            _recover_scope_layout(directory.parent)
        else:
            directory.mkdir(parents=True, exist_ok=True)
        if not directory.is_dir():
            return []
    paths = [path for path in directory.glob("*.json") if _is_record_json_path(path)]
    return sorted(paths, key=lambda item: str(item))


def get_config(repo_url: str, project_id: Optional[str] = None) -> dict[str, Any]:
    repo_url = normalize_repo_url(repo_url)
    root = ensure_scope(repo_url, project_id)
    stored = _read_json(root / "config.json") or {}
    merged = {**default_config(repo_url, project_id), **stored, "repoUrl": repo_url, "projectId": project_id}
    return normalize_config_record(merged)


def list_proactive_dispatch_scopes(*, enabled_only: bool = False) -> list[dict[str, Any]]:
    """Enumerate repo/project scopes that have proactive config on disk (for cron listing)."""
    root = store_root()
    if not root.is_dir():
        return []
    scopes: list[dict[str, Any]] = []
    for scope_dir in sorted(root.iterdir(), key=lambda item: item.name):
        if not scope_dir.is_dir() or scope_dir.name.startswith("."):
            continue
        stored = _read_json(scope_dir / "config.json")
        if not stored:
            continue
        repo_url = normalize_repo_url(str(stored.get("repoUrl") or ""))
        if not repo_url:
            continue
        project_id = stored.get("projectId")
        record = get_config(repo_url, project_id)
        if enabled_only and not record.get("enabled"):
            continue
        scopes.append(
            {
                "repoUrl": record.get("repoUrl"),
                "projectId": record.get("projectId"),
                "enabled": bool(record.get("enabled")),
                "morningDeadline": record.get("morningDeadline"),
                "targetCount": record.get("targetCount"),
                "timezone": record.get("timezone"),
            }
        )
    return scopes


def update_config(repo_url: str, project_id: Optional[str], patch: dict[str, Any]) -> dict[str, Any]:
    validated = validate_config_patch(patch)
    current = get_config(repo_url, project_id)
    current.update(validated)
    current["updatedAt"] = now_iso()
    return _write_json(
        ensure_scope(repo_url, project_id) / "config.json",
        normalize_config_record(current),
    )


def create_batch(
    repo_url: str,
    project_id: Optional[str],
    target_count: int,
    repo_head: Optional[str],
    repo_name: Optional[str] = None,
) -> dict[str, Any]:
    created = now_iso()
    batch = {
        "id": uuid.uuid4().hex,
        "date": today_key(),
        "status": "queued",
        "repoUrl": normalize_repo_url(repo_url),
        "repoName": repo_name,
        "projectId": project_id,
        "targetCount": max(1, min(int(target_count or 6), 6)),
        "repoHead": repo_head,
        "dispatchStartedAt": created,
        "dispatchCompletedAt": None,
        "progress": {"discovered": 0, "selected": 0, "materialized": 0, "ready": 0, "dismissed": 0},
        "metrics": {"qualityMode": "high", "shortfallReason": None, "averageScore": 0},
        "transitions": [{"at": created, "status": "queued", "detail": "Batch allocated for proactive dispatch."}],
        "createdAt": created,
        "updatedAt": created,
    }
    return update_batch(batch)


def normalize_repo_head(repo_head: Optional[str]) -> Optional[str]:
    if repo_head is None:
        return None
    text = str(repo_head).strip()
    return text or None


def repo_heads_match(left: Optional[str], right: Optional[str]) -> bool:
    normalized_left = normalize_repo_head(left)
    normalized_right = normalize_repo_head(right)
    if normalized_left and normalized_right:
        return normalized_left == normalized_right
    return normalized_left is None and normalized_right is None


def is_active_batch(batch: dict[str, Any]) -> bool:
    return str(batch.get("status") or "") in ACTIVE_BATCH_STATUSES


def transition_batch(batch: dict[str, Any], status: str, detail: str = "") -> dict[str, Any]:
    batch["status"] = status
    batch.setdefault("transitions", []).append(
        {
            "at": now_iso(),
            "status": status,
            "detail": detail,
        }
    )
    return update_batch(batch)


def find_active_batch(repo_url: str, project_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    actives = [batch for batch in list_batches(repo_url, project_id, limit=50) if is_active_batch(batch)]
    if not actives:
        return None
    actives.sort(key=_batch_sort_key, reverse=True)
    return actives[0]


def find_reusable_complete_batch(
    repo_url: str,
    project_id: Optional[str],
    repo_head: Optional[str],
    *,
    day: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Same calendar day + same repo HEAD + completed batch → idempotent reuse."""
    day_key = day or today_key()
    for batch in list_batches(repo_url, project_id, limit=50):
        if batch.get("date") != day_key:
            continue
        if batch.get("status") != "complete":
            continue
        if repo_heads_match(batch.get("repoHead"), repo_head):
            return batch
    return None


def _batch_path(batch: dict[str, Any]) -> Path:
    return ensure_scope(batch["repoUrl"], batch.get("projectId")) / "batches" / f"{batch['id']}.json"


def update_batch(batch: dict[str, Any]) -> dict[str, Any]:
    batch["updatedAt"] = now_iso()
    return _write_json(_batch_path(batch), batch)


def get_batch(repo_url: str, project_id: Optional[str], batch_id: str) -> Optional[dict[str, Any]]:
    path = ensure_scope(repo_url, project_id) / "batches" / f"{batch_id}.json"
    return _read_json(path)


def list_batches(repo_url: str, project_id: Optional[str] = None, limit: int = 20) -> list[dict[str, Any]]:
    root = ensure_scope(repo_url, project_id) / "batches"
    result = [item for item in (_read_json(path) for path in _iter_record_paths(root)) if item]
    result.sort(key=_batch_sort_key, reverse=True)
    cap = max(1, min(int(limit or 20), 100))
    return result[:cap]


def latest_batch(repo_url: str, project_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    batches = list_batches(repo_url, project_id, limit=1)
    return batches[0] if batches else None


def create_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    candidate.setdefault("id", uuid.uuid4().hex)
    candidate.setdefault("createdAt", now_iso())
    return update_candidate(candidate)


def update_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    candidate["updatedAt"] = now_iso()
    path = ensure_scope(candidate["repoUrl"], candidate.get("projectId")) / "candidates" / f"{candidate['id']}.json"
    return _write_json(path, candidate)


def get_candidate(repo_url: str, project_id: Optional[str], candidate_id: str) -> Optional[dict[str, Any]]:
    path = ensure_scope(repo_url, project_id) / "candidates" / f"{candidate_id}.json"
    return _read_json(path)


def find_candidate(candidate_id: str) -> Optional[dict[str, Any]]:
    root = store_root()
    if not root.exists():
        return None
    matches = sorted(
        (
            path
            for scope_dir in sorted(root.iterdir(), key=lambda item: item.name)
            if scope_dir.is_dir() and scope_dir.name not in _SKIP_GLOB_NAMES
            for path in _iter_record_paths(scope_dir / "candidates")
            if path.stem == candidate_id
        ),
        key=lambda item: str(item),
    )
    for path in matches:
        candidate = _read_json(path)
        if candidate:
            return candidate
    return None


def batch_progress_from_candidates(candidates: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "discovered": len(candidates),
        "selected": len(
            [
                item
                for item in candidates
                if item.get("status")
                in {"selected", "executing", "review_ready", "needs_execution", "approved", "approved_internal"}
            ]
        ),
        "materialized": len([item for item in candidates if item.get("runId")]),
        "ready": len([item for item in candidates if item.get("status") == "review_ready"]),
        "dismissed": len([item for item in candidates if item.get("status") == "dismissed"]),
    }


def list_candidates(
    repo_url: str,
    project_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    include_dismissed: bool = False,
    limit: int = 100,
) -> list[dict[str, Any]]:
    root = ensure_scope(repo_url, project_id) / "candidates"
    from proactive_failure_recovery import is_usable_candidate_record

    result = []
    for item in (_read_json(path) for path in _iter_record_paths(root)):
        if not item or not is_usable_candidate_record(item):
            continue
        if batch_id and item.get("batchId") != batch_id:
            continue
        if not include_dismissed and item.get("status") == "dismissed":
            continue
        result.append(item)
    result.sort(key=_candidate_sort_key, reverse=True)
    cap = max(1, min(int(limit or 100), 500))
    return result[:cap]


def run_console_summary(run_id: Optional[str]) -> Optional[dict[str, Any]]:
    from proactive_failure_recovery import resolve_linked_run_summary

    return resolve_linked_run_summary(run_id)


def enrich_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    from proactive_failure_recovery import safe_enrich_candidate

    return safe_enrich_candidate(candidate)


def enrich_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from proactive_failure_recovery import safe_enrich_candidates

    return safe_enrich_candidates(candidates)


def summarize_status(repo_url: str, project_id: Optional[str] = None) -> dict[str, Any]:
    from proactive_failure_recovery import safe_build_status_summary

    return safe_build_status_summary(repo_url, project_id)


read_config = get_config
write_config = update_config
new_batch = create_batch
write_batch = update_batch
read_candidate = get_candidate
write_candidate = update_candidate
