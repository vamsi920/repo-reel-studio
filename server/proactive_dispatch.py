from __future__ import annotations

from typing import Any, Optional

from proactive_store import (
    enrich_candidates,
    find_active_batch,
    find_reusable_complete_batch,
    list_candidates,
)

DISPATCH_SKIPPED_STATUS = "skipped"
DISPATCH_SKIPPED_REASON = "Proactive Mode is disabled for this repo/project."
DISPATCH_SKIPPED_CODE = "proactive_disabled"
DISPATCH_SKIPPED_SHORTFALL = DISPATCH_SKIPPED_REASON


def build_dispatch_skipped_response(config: dict[str, Any]) -> dict[str, Any]:
    """Stable no-op payload when proactive mode is off (cron + manual Run now)."""
    from proactive_config import clamp_target_count

    target = clamp_target_count(int(config.get("targetCount") or 6))
    return {
        "status": DISPATCH_SKIPPED_STATUS,
        "reason": DISPATCH_SKIPPED_REASON,
        "code": DISPATCH_SKIPPED_CODE,
        "dispatchMode": "disabled",
        "manualOnly": True,
        "config": config,
        "batch": None,
        "ready": 0,
        "target": target,
        "candidates": [],
        "shortfallReason": DISPATCH_SKIPPED_SHORTFALL,
    }


def build_dispatch_response(
    dispatch_status: str,
    config: dict[str, Any],
    target: int,
    repo_url: str,
    project_id: Optional[str],
    batch: Optional[dict[str, Any]] = None,
    *,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    batch_id = (batch or {}).get("id")
    candidates = list_candidates(repo_url, project_id, batch_id, include_dismissed=True) if batch_id else []
    ready = len([item for item in candidates if item.get("status") == "review_ready"])
    payload: dict[str, Any] = {
        "status": dispatch_status,
        "config": config,
        "batch": batch,
        "ready": ready,
        "target": target,
        "candidates": enrich_candidates(candidates[:6]),
        "shortfallReason": (batch or {}).get("metrics", {}).get("shortfallReason") if batch else None,
    }
    if reason:
        payload["reason"] = reason
    return payload


def check_dispatch_idempotency(
    repo_url: str,
    project_id: Optional[str],
    config: dict[str, Any],
    target: int,
    repo_head: Optional[str],
) -> Optional[dict[str, Any]]:
    active = find_active_batch(repo_url, project_id)
    if active:
        phase = str(active.get("status") or "active")
        return build_dispatch_response(
            "in_progress",
            config,
            target,
            repo_url,
            project_id,
            active,
            reason=(
                f"A proactive dispatch is already running for this repo/project (batch {active.get('id', '')[:8]}, "
                f"phase {phase}). Wait for it to finish before starting another scan."
            ),
        )

    reused = find_reusable_complete_batch(repo_url, project_id, repo_head)
    if reused:
        head_label = (reused.get("repoHead") or "unknown")[:12]
        return build_dispatch_response(
            "unchanged",
            config,
            target,
            repo_url,
            project_id,
            reused,
            reason=(
                "Today's proactive batch already completed for this repository HEAD "
                f"({head_label}). Push new commits or wait until tomorrow to run another scan."
            ),
        )

    return None
