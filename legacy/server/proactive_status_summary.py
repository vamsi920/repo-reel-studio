from __future__ import annotations

from typing import Any, Callable, Optional

from proactive_store import (
    ACTIVE_BATCH_STATUSES,
    TERMINAL_BATCH_STATUSES,
    _candidate_sort_key,
    batch_progress_from_candidates,
    enrich_candidates,
    find_active_batch,
    get_config,
    latest_batch,
    list_candidates,
)

STATUS_CANDIDATE_LIMIT = 6
STATUS_LIST_LIMIT = 100


def resolve_status_batch(repo_url: str, project_id: Optional[str] = None) -> Optional[dict[str, Any]]:
    """Prefer the newest in-progress batch; otherwise the newest batch overall."""
    active = find_active_batch(repo_url, project_id)
    if active:
        return active
    return latest_batch(repo_url, project_id)


def resolve_target_count(config: dict[str, Any], batch: Optional[dict[str, Any]]) -> int:
    if batch and batch.get("targetCount") is not None:
        try:
            return max(1, min(int(batch["targetCount"]), 6))
        except (TypeError, ValueError):
            pass
    try:
        return max(1, min(int(config.get("targetCount") or 6), 6))
    except (TypeError, ValueError):
        return 6


def resolve_shortfall_reason(
    batch: Optional[dict[str, Any]],
    *,
    ready: int,
    target: int,
) -> Optional[str]:
    if not batch:
        return None

    status = str(batch.get("status") or "")
    if status in TERMINAL_BATCH_STATUSES and status != "failed" and ready >= target:
        return None

    metrics = batch.get("metrics") or {}
    stored = metrics.get("shortfallReason")
    if isinstance(stored, str) and stored.strip():
        return stored.strip()

    if status == "failed":
        return "Dispatch failed."
    if status in ACTIVE_BATCH_STATUSES:
        detail = ""
        transitions = batch.get("transitions") or []
        if transitions:
            detail = str(transitions[-1].get("detail") or "").strip()
        return detail or f"Batch is {status}."
    if status in TERMINAL_BATCH_STATUSES and status != "failed":
        if ready >= target:
            return None
        return f"{ready}/{target} review-ready candidates."
    return None


def build_status_summary(
    repo_url: str,
    project_id: Optional[str] = None,
    *,
    config: Optional[dict[str, Any]] = None,
    enrich_fn: Callable[[list[dict[str, Any]]], list[dict[str, Any]]] = enrich_candidates,
) -> dict[str, Any]:
    config = config or get_config(repo_url, project_id)
    batch = resolve_status_batch(repo_url, project_id)
    batch_id = str(batch.get("id") or "").strip() if batch else ""

    all_in_batch: list[dict[str, Any]] = []
    if batch_id:
        all_in_batch = list_candidates(
            repo_url,
            project_id,
            batch_id,
            include_dismissed=True,
            limit=STATUS_LIST_LIMIT,
        )

    if batch:
        batch = dict(batch)
        batch["progress"] = batch_progress_from_candidates(all_in_batch)

    ready = int((batch or {}).get("progress", {}).get("ready", 0)) if batch else 0
    target = resolve_target_count(config, batch)

    visible = [item for item in all_in_batch if item.get("status") != "dismissed"]
    visible.sort(key=_candidate_sort_key, reverse=True)
    presentation = enrich_fn(visible[:STATUS_CANDIDATE_LIMIT])

    payload: dict[str, Any] = {
        "config": config,
        "batch": batch,
        "ready": ready,
        "target": target,
        "candidates": presentation,
        "shortfallReason": resolve_shortfall_reason(batch, ready=ready, target=target),
        "storeRecovery": {"degraded": False, "quarantinedRecords": 0, "messages": []},
    }
    if batch and str(batch.get("status") or "") == "failed":
        messages = list(payload["storeRecovery"]["messages"])
        detail = resolve_shortfall_reason(batch, ready=ready, target=target) or "Dispatch failed."
        if detail not in messages:
            messages.append(detail)
        payload["storeRecovery"]["messages"] = messages
    return payload
