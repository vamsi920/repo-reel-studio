from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from proactive_store import (
    ACTIVE_BATCH_STATUSES,
    TERMINAL_BATCH_STATUSES,
    _batch_sort_key,
    _iter_record_paths,
    find_active_batch,
    is_active_batch,
    latest_batch,
    list_batches,
    list_candidates,
    normalize_repo_url,
    scope_key,
    store_root,
)

DEFAULT_RETENTION_DAYS = 30
DEFAULT_KEEP_BATCHES = 5
DEFAULT_MIN_AGE_HOURS = 24

PROTECTED_CANDIDATE_STATUSES = frozenset(
    {
        "review_ready",
        "approved",
        "approved_internal",
        "needs_execution",
        "executing",
        "selected",
        "preparing",
        "patching",
        "validating",
    }
)

LOW_RISK_CANDIDATE_STATUSES = frozenset({"dismissed", "discovered"})

PROTECTED_RUN_STATUSES = frozenset(
    {"queued", "preparing", "running", "validating", "awaiting_review", "approved"}
)

@dataclass
class RetentionPlan:
    repo_url: str
    project_id: Optional[str]
    scope_root: Path
    dry_run: bool
    retention_days: int
    keep_batches: int
    protected_batch_ids: set[str] = field(default_factory=set)
    protected_candidate_ids: set[str] = field(default_factory=set)
    protected_run_ids: set[str] = field(default_factory=set)
    batch_paths: list[Path] = field(default_factory=list)
    candidate_paths: list[Path] = field(default_factory=list)
    workspace_paths: list[Path] = field(default_factory=list)
    run_workspace_paths: list[Path] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        return {
            "repoUrl": self.repo_url,
            "projectId": self.project_id,
            "dryRun": self.dry_run,
            "retentionDays": self.retention_days,
            "keepBatches": self.keep_batches,
            "protectedBatchIds": sorted(self.protected_batch_ids),
            "protectedCandidateIds": sorted(self.protected_candidate_ids),
            "protectedRunIds": sorted(self.protected_run_ids),
            "batches": [str(path) for path in self.batch_paths],
            "candidates": [str(path) for path in self.candidate_paths],
            "workspaces": [str(path) for path in self.workspace_paths],
            "runWorkspaces": [str(path) for path in self.run_workspace_paths],
            "skipped": list(self.skipped),
        }


def retention_days() -> int:
    raw = os.getenv("PROACTIVE_RETENTION_DAYS", "").strip()
    if not raw:
        return DEFAULT_RETENTION_DAYS
    try:
        return max(1, min(int(raw), 3650))
    except (TypeError, ValueError):
        return DEFAULT_RETENTION_DAYS


def keep_batches_count() -> int:
    raw = os.getenv("PROACTIVE_KEEP_BATCHES", "").strip()
    if not raw:
        return DEFAULT_KEEP_BATCHES
    try:
        return max(1, min(int(raw), 100))
    except (TypeError, ValueError):
        return DEFAULT_KEEP_BATCHES


def cleanup_execute_allowed() -> bool:
    return os.getenv("PROACTIVE_CLEANUP_EXECUTE", "").strip() in {"1", "true", "yes"}


def parse_iso_timestamp(value: Any) -> Optional[datetime]:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def retention_anchor(record: dict[str, Any]) -> Any:
    for key in (
        "dispatchCompletedAt",
        "dismissedAt",
        "completedAt",
        "updatedAt",
        "createdAt",
    ):
        value = record.get(key)
        if value:
            return value
    return None


def age_days(value: Any, *, now: Optional[datetime] = None) -> Optional[float]:
    parsed = parse_iso_timestamp(value)
    if not parsed:
        return None
    reference = now or datetime.now(timezone.utc)
    return (reference - parsed).total_seconds() / 86400.0


def run_has_user_artifacts(run: dict[str, Any]) -> bool:
    artifacts = run.get("artifacts") or {}
    if str(artifacts.get("patch") or "").strip():
        return True
    if artifacts.get("prDraft"):
        return True
    if artifacts.get("changedFiles"):
        return True
    if str(artifacts.get("diffStat") or "").strip():
        return True
    promotion = run.get("promotion") or {}
    if promotion.get("prUrl") or promotion.get("commitSha"):
        return True
    return False


def _read_run_safe(run_id: str) -> Optional[dict[str, Any]]:
    if not run_id:
        return None
    try:
        from agent_runs import read_run

        return read_run(run_id)
    except Exception:
        return None


def protected_batch_ids_for_scope(
    repo_url: str,
    project_id: Optional[str],
    *,
    keep_batches: int,
) -> set[str]:
    protected: set[str] = set()
    active = find_active_batch(repo_url, project_id)
    if active and active.get("id"):
        protected.add(str(active["id"]))
    latest = latest_batch(repo_url, project_id)
    if latest and latest.get("id"):
        protected.add(str(latest["id"]))
    ordered = sorted(list_batches(repo_url, project_id, limit=100), key=_batch_sort_key, reverse=True)
    for batch in ordered[:keep_batches]:
        if batch.get("id"):
            protected.add(str(batch["id"]))
    return protected


def is_candidate_protected(candidate: dict[str, Any], protected_batch_ids: set[str]) -> bool:
    status = str(candidate.get("status") or "")
    if status == "review_ready":
        return True
    if status in PROTECTED_CANDIDATE_STATUSES:
        return True
    batch_id = str(candidate.get("batchId") or "")
    if batch_id and batch_id in protected_batch_ids:
        status = str(candidate.get("status") or "")
        if status not in LOW_RISK_CANDIDATE_STATUSES:
            return True
    run_id = str(candidate.get("runId") or "").strip()
    if run_id:
        run = _read_run_safe(run_id)
        if run:
            if str(run.get("status") or "") in PROTECTED_RUN_STATUSES:
                return True
            if run_has_user_artifacts(run):
                return True
    return False


def collect_protected_candidate_and_run_ids(
    repo_url: str,
    project_id: Optional[str],
    protected_batch_ids: set[str],
) -> tuple[set[str], set[str]]:
    candidate_ids: set[str] = set()
    run_ids: set[str] = set()
    for candidate in list_candidates(repo_url, project_id, include_dismissed=True, limit=500):
        cid = str(candidate.get("id") or "")
        if not cid:
            continue
        if is_candidate_protected(candidate, protected_batch_ids):
            candidate_ids.add(cid)
            run_id = str(candidate.get("runId") or "").strip()
            if run_id:
                run_ids.add(run_id)
    return candidate_ids, run_ids


def plan_scope_retention(
    repo_url: str,
    project_id: Optional[str] = None,
    *,
    retention_days_value: Optional[int] = None,
    keep_batches_value: Optional[int] = None,
    dry_run: bool = True,
    min_age_hours: int = DEFAULT_MIN_AGE_HOURS,
) -> RetentionPlan:
    repo_url = normalize_repo_url(repo_url)
    days = retention_days_value if retention_days_value is not None else retention_days()
    keep = keep_batches_value if keep_batches_value is not None else keep_batches_count()
    scope_root = store_root() / scope_key(repo_url, project_id)
    plan = RetentionPlan(
        repo_url=repo_url,
        project_id=project_id,
        scope_root=scope_root,
        dry_run=dry_run,
        retention_days=days,
        keep_batches=keep,
    )
    if not scope_root.is_dir():
        plan.skipped.append("scope_missing")
        return plan

    protected_batches = protected_batch_ids_for_scope(repo_url, project_id, keep_batches=keep)
    plan.protected_batch_ids = protected_batches
    protected_candidates, protected_runs = collect_protected_candidate_and_run_ids(
        repo_url, project_id, protected_batches
    )
    plan.protected_candidate_ids = protected_candidates
    plan.protected_run_ids = protected_runs

    now = datetime.now(timezone.utc)
    min_age_days = max(0.0, min_age_hours / 24.0)

    for path in _iter_record_paths(scope_root / "batches"):
        batch = _read_json_dict(path)
        if not batch:
            continue
        batch_id = str(batch.get("id") or path.stem)
        if batch_id in protected_batches:
            continue
        status = str(batch.get("status") or "")
        if status in ACTIVE_BATCH_STATUSES:
            continue
        if status not in TERMINAL_BATCH_STATUSES:
            plan.skipped.append(f"batch_non_terminal:{batch_id}")
            continue
        updated_age = age_days(retention_anchor(batch), now=now)
        if updated_age is None or updated_age < min_age_days:
            plan.skipped.append(f"batch_too_young:{batch_id}")
            continue
        if updated_age < days:
            continue
        plan.batch_paths.append(path)

    deletable_batch_ids = {path.stem for path in plan.batch_paths}

    for path in _iter_record_paths(scope_root / "candidates"):
        candidate = _read_json_dict(path)
        if not candidate:
            continue
        candidate_id = str(candidate.get("id") or path.stem)
        if candidate_id in protected_candidates:
            continue
        if is_candidate_protected(candidate, protected_batches):
            continue
        status = str(candidate.get("status") or "")
        if status not in LOW_RISK_CANDIDATE_STATUSES:
            plan.skipped.append(f"candidate_status:{candidate_id}:{status}")
            continue
        batch_id = str(candidate.get("batchId") or "")
        if batch_id and batch_id not in deletable_batch_ids:
            plan.skipped.append(f"candidate_batch_protected:{candidate_id}")
            continue
        updated_age = age_days(retention_anchor(candidate), now=now)
        if updated_age is None or updated_age < min_age_days:
            plan.skipped.append(f"candidate_too_young:{candidate_id}")
            continue
        if updated_age < days:
            continue
        plan.candidate_paths.append(path)

    discovery = scope_root / "workspaces" / "discovery"
    if discovery.is_dir() and not find_active_batch(repo_url, project_id):
        latest = latest_batch(repo_url, project_id)
        latest_age = age_days((latest or {}).get("updatedAt"), now=now) if latest else None
        if latest_age is not None and latest_age >= min_age_days:
            plan.workspace_paths.append(discovery)

    return plan


def plan_run_workspace_retention(
    *,
    retention_days_value: Optional[int] = None,
    protected_run_ids: Optional[set[str]] = None,
    dry_run: bool = True,
    min_age_hours: int = DEFAULT_MIN_AGE_HOURS,
) -> list[Path]:
    try:
        from agent_runs import RUNS_ROOT, read_run
    except Exception:
        return []

    days = retention_days_value if retention_days_value is not None else retention_days()
    protected = set(protected_run_ids or ())
    now = datetime.now(timezone.utc)
    min_age_days = max(0.0, min_age_hours / 24.0)
    targets: list[Path] = []

    if not RUNS_ROOT.is_dir():
        return targets

    for entry in sorted(RUNS_ROOT.iterdir(), key=lambda item: item.name):
        if not entry.is_dir():
            continue
        run_id = entry.name
        if run_id in protected:
            continue
        run = read_run(run_id)
        if not run:
            continue
        status = str(run.get("status") or "")
        if status in PROTECTED_RUN_STATUSES:
            continue
        if run_has_user_artifacts(run):
            continue
        updated_age = age_days(run.get("updatedAt") or run.get("startedAt"), now=now)
        if updated_age is None or updated_age < min_age_days or updated_age < days:
            continue
        workspace = entry / "workspace"
        if workspace.is_dir():
            targets.append(workspace)
    return targets


def _read_json_dict(path: Path) -> Optional[dict[str, Any]]:
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def execute_retention_plan(plan: RetentionPlan) -> dict[str, Any]:
    if plan.dry_run:
        return {"dryRun": True, "deleted": 0, "plan": plan.summary()}
    if not cleanup_execute_allowed():
        return {
            "dryRun": False,
            "deleted": 0,
            "error": "Set PROACTIVE_CLEANUP_EXECUTE=1 to delete files.",
            "plan": plan.summary(),
        }

    deleted = 0
    errors: list[str] = []

    for path in plan.batch_paths + plan.candidate_paths:
        try:
            path.unlink(missing_ok=True)
            deleted += 1
        except OSError as exc:
            errors.append(f"{path}: {exc}")

    for path in plan.workspace_paths + plan.run_workspace_paths:
        try:
            shutil.rmtree(path, ignore_errors=False)
            deleted += 1
        except OSError as exc:
            errors.append(f"{path}: {exc}")

    return {"dryRun": False, "deleted": deleted, "errors": errors, "plan": plan.summary()}


def plan_all_scopes_retention(*, dry_run: bool = True) -> list[RetentionPlan]:
    root = store_root()
    if not root.is_dir():
        return []
    plans: list[RetentionPlan] = []
    for scope_dir in sorted(root.iterdir(), key=lambda item: item.name):
        if not scope_dir.is_dir() or scope_dir.name in {".corrupt", "workspaces"}:
            continue
        config = _read_json_dict(scope_dir / "config.json") or {}
        repo_url = str(config.get("repoUrl") or "").strip()
        if not repo_url:
            continue
        project_id = config.get("projectId")
        plan = plan_scope_retention(repo_url, project_id, dry_run=dry_run)
        plan.run_workspace_paths = plan_run_workspace_retention(
            protected_run_ids=plan.protected_run_ids,
            dry_run=dry_run,
        )
        plans.append(plan)
    return plans
