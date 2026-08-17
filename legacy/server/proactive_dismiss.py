from __future__ import annotations

from typing import Any, Optional

from proactive_store import (
    batch_progress_from_candidates,
    enrich_candidate,
    get_batch,
    list_candidates,
    now_iso,
    update_batch,
    update_candidate,
)


def append_dismiss_timeline_event(
    candidate: dict[str, Any],
    *,
    reason: str,
) -> dict[str, Any]:
    candidate["stage"] = "dismissed"
    candidate.setdefault("timeline", []).append(
        {
            "at": now_iso(),
            "stage": "dismissed",
            "title": "Candidate dismissed",
            "detail": reason,
            "level": "info",
        }
    )
    return candidate


def sync_batch_progress_for_candidate(candidate: dict[str, Any]) -> Optional[dict[str, Any]]:
    batch_id = str(candidate.get("batchId") or "").strip()
    if not batch_id:
        return None
    batch = get_batch(candidate["repoUrl"], candidate.get("projectId"), batch_id)
    if not batch:
        return None
    candidates = list_candidates(
        candidate["repoUrl"],
        candidate.get("projectId"),
        batch_id,
        include_dismissed=True,
    )
    batch["progress"] = batch_progress_from_candidates(candidates)
    return update_batch(batch)


def dismiss_proactive_candidate(
    candidate: dict[str, Any],
    *,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    if candidate.get("status") == "dismissed":
        from fastapi import HTTPException

        raise HTTPException(status_code=409, detail="Candidate is already dismissed.")

    detail = (reason or "").strip() or "Dismissed by operator."
    candidate["status"] = "dismissed"
    candidate["dismissedAt"] = now_iso()
    candidate["reviewReady"] = False
    candidate["notSelectedReason"] = detail
    candidate["updatedAt"] = now_iso()
    append_dismiss_timeline_event(candidate, reason=detail)
    update_candidate(candidate)

    batch = sync_batch_progress_for_candidate(candidate)
    return {
        "candidate": enrich_candidate(candidate),
        "batch": batch,
    }
