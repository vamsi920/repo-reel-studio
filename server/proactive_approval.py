from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

from proactive_execution_control import candidate_blocks_pr_approval, is_run_cancel_requested

PROMOTE_PR = "promote_pr"
APPROVED_INTERNAL = "approved_internal"
REJECT = "reject"

TERMINAL_CANDIDATE_STATUSES = frozenset({"approved", "approved_internal", "dismissed"})
BLOCKED_FAILURE_CATEGORIES = frozenset({"cancelled", "timeout", "no_patch", "execution_error"})
PR_READY_RUN_STATUSES = frozenset({"awaiting_review"})


@dataclass(frozen=True)
class ProactiveApprovalOutcome:
    action: str
    detail: str
    http_status: int = 400
    internal_reason: Optional[str] = None


def _artifacts(run: dict[str, Any]) -> dict[str, Any]:
    return run.get("artifacts") or {}


def _has_patch_artifacts(run: dict[str, Any]) -> bool:
    artifacts = _artifacts(run)
    patch = str(artifacts.get("patch") or "").strip()
    paths = artifacts.get("artifactPaths") or {}
    has_path = bool(str(paths.get("patchDiff") or "").strip())
    return bool(patch) and has_path


def _policy_allows_promotion(run: dict[str, Any]) -> tuple[bool, list[str]]:
    violations = [str(item).strip() for item in (run.get("policyViolations") or []) if str(item).strip()]
    return (len(violations) == 0, violations)


def assess_pr_promotion_readiness(run: dict[str, Any]) -> tuple[bool, str]:
    status = str(run.get("status") or "")
    if status not in PR_READY_RUN_STATUSES:
        return False, f"Run status must be awaiting_review (current: {status or 'unknown'})."

    workspace_path = str(_artifacts(run).get("workspacePath") or "").strip()
    if not workspace_path:
        return False, "Linked run is missing sandbox workspacePath."

    if not _has_patch_artifacts(run):
        return False, "Linked run is missing patch artifacts."

    allowed, violations = _policy_allows_promotion(run)
    if not allowed:
        return False, f"Policy gates block PR promotion: {'; '.join(violations)}"

    failure = str(_artifacts(run).get("failureCategory") or "").strip()
    if failure in BLOCKED_FAILURE_CATEGORIES:
        return False, f"Linked run failureCategory blocks PR promotion ({failure})."

    approval = run.get("approval") or {}
    if str(approval.get("status") or "") == "approved" and approval.get("prUrl"):
        return False, "Linked run already has an approved PR."

    return True, "Patch-backed run is eligible for PR promotion."


def resolve_proactive_approval(
    candidate: dict[str, Any],
    run: Optional[dict[str, Any]],
) -> ProactiveApprovalOutcome:
    from proactive_policy_visibility import POLICY_STATE_BLOCKED, POLICY_STATE_WARNING, policy_visibility_from_run

    status = str(candidate.get("status") or "")
    if status in TERMINAL_CANDIDATE_STATUSES:
        label = status.replace("_", " ")
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail=f"Candidate is already {label}.",
            http_status=409,
        )

    if candidate_blocks_pr_approval(candidate):
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail="Candidate execution was cancelled, timed out, or blocked. PR promotion is not allowed.",
            http_status=400,
        )

    if status != "review_ready":
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail=f"Candidate must be review_ready before approval (current: {status or 'unknown'}).",
            http_status=400,
        )

    run_id = str(candidate.get("runId") or "").strip()
    if not run_id:
        return ProactiveApprovalOutcome(
            action=APPROVED_INTERNAL,
            detail="No linked Agent Ops run. Recorded internal approval only; no PR opened.",
            internal_reason="missing_run",
        )

    if not run:
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail="Linked Agent Ops run was not found.",
            http_status=404,
        )

    if run.get("id") != run_id:
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail="Candidate runId does not match the linked run record.",
            http_status=400,
        )

    if run.get("status") == "cancelled" or is_run_cancel_requested(run):
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail="Linked Agent Ops run is cancelled. PR approval is blocked.",
            http_status=400,
        )

    policy = policy_visibility_from_run(run, candidate_metadata=candidate.get("reviewMetadata"))
    if policy["policyStatus"] == POLICY_STATE_BLOCKED or policy["prApprovalBlocked"]:
        reasons = "; ".join(policy["policyViolations"]) or policy.get("policySummary") or "Policy gate blocked."
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail=f"Policy violations block PR approval: {reasons}",
            http_status=403,
        )

    failure = _artifacts(run).get("failureCategory")
    if failure in BLOCKED_FAILURE_CATEGORIES:
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail="Linked Agent Ops run did not complete with patch-backed artifacts. PR approval is blocked.",
            http_status=400,
        )

    ready, readiness_detail = assess_pr_promotion_readiness(run)
    if ready:
        if policy["policyStatus"] == POLICY_STATE_WARNING or policy["prPromotionDiscouraged"]:
            warning_detail = "; ".join(policy["policyWarnings"]) or policy.get("policySummary") or "Sensitive paths require review."
            return ProactiveApprovalOutcome(
                action=APPROVED_INTERNAL,
                detail=(
                    f"{readiness_detail} PR promotion discouraged ({warning_detail}). "
                    "Recorded internal approval only."
                ),
                internal_reason="policy_warning",
            )
        return ProactiveApprovalOutcome(
            action=PROMOTE_PR,
            detail=readiness_detail,
        )

    if str(run.get("status") or "") == "approved" or str((run.get("approval") or {}).get("status") or "") == "approved":
        return ProactiveApprovalOutcome(
            action=REJECT,
            detail=readiness_detail or "Linked run is already approved.",
            http_status=409,
        )

    return ProactiveApprovalOutcome(
        action=APPROVED_INTERNAL,
        detail=f"{readiness_detail} Recorded internal approval only; no PR opened.",
        internal_reason=readiness_detail,
    )


def apply_internal_run_approval(run: dict[str, Any], *, detail: str) -> dict[str, Any]:
    from proactive_store import now_iso

    approval = run.setdefault("approval", {})
    approval["status"] = "approved_internal"
    approval["approvedAt"] = now_iso()
    approval["promotionLog"] = [detail]
    run["updatedAt"] = now_iso()
    return run


def approve_proactive_candidate(
    candidate: dict[str, Any],
    *,
    branch_name: Optional[str] = None,
    run_loader=None,
    promote_fn=None,
) -> dict[str, Any]:
    from agent_runs import approve_agent_run_for_pr, read_required_run, write_run
    from proactive_store import enrich_candidate, now_iso, update_candidate

    run_id = str(candidate.get("runId") or "").strip() or None
    loader = run_loader or read_required_run
    run = loader(run_id) if run_id else None
    outcome = resolve_proactive_approval(candidate, run)

    if outcome.action == REJECT:
        from fastapi import HTTPException

        raise HTTPException(status_code=outcome.http_status, detail=outcome.detail)

    promoted = None
    promote = promote_fn or approve_agent_run_for_pr
    if outcome.action == PROMOTE_PR and run_id:
        promoted = promote(run_id, branch_name)
        candidate["status"] = "approved"
        candidate["approvedAt"] = now_iso()
        candidate["updatedAt"] = now_iso()
        candidate.setdefault("reviewMetadata", {}).update(
            {
                "approvedInternalOnly": False,
                "autoOpenPr": False,
                "approvalDetail": outcome.detail,
            }
        )
    else:
        if run:
            apply_internal_run_approval(run, detail=outcome.detail)
            write_run(run)
        apply_internal_candidate_approval(candidate, detail=outcome.detail)

    update_candidate(candidate)
    return {
        "candidate": enrich_candidate(candidate),
        "run": promoted,
        "approvalOutcome": outcome.action,
        "detail": outcome.detail,
    }


def apply_internal_candidate_approval(candidate: dict[str, Any], *, detail: str) -> dict[str, Any]:
    candidate["status"] = "approved_internal"
    from proactive_store import now_iso

    candidate["approvedAt"] = now_iso()
    candidate["updatedAt"] = now_iso()
    candidate.setdefault("reviewMetadata", {}).update(
        {
            "approvedInternalOnly": True,
            "autoOpenPr": False,
            "prApprovalBlocked": False,
            "approvalDetail": detail,
        }
    )
    return candidate
