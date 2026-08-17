from __future__ import annotations

from typing import Any, Optional

FailureKind = str

FAILURE_KIND_NO_PATCH = "no_patch"
FAILURE_KIND_EXECUTION_ERROR = "execution_error"

FAILURE_LABELS: dict[str, str] = {
    FAILURE_KIND_NO_PATCH: "No patch produced",
    FAILURE_KIND_EXECUTION_ERROR: "Executor error",
}

RETRY_INSTRUCTIONS: dict[str, list[str]] = {
    FAILURE_KIND_NO_PATCH: [
        "Open the linked Agent Ops run and confirm the executor finished without a diff.",
        "Re-run proactive dispatch or retry after checking OpenDevin/fallback availability.",
        "Tighten the candidate scope if the hypothesis is too broad for a minimal patch.",
    ],
    FAILURE_KIND_EXECUTION_ERROR: [
        "Open the linked Agent Ops run timeline for the error or stack trace.",
        "Fix backend connectivity, credentials, or workspace issues before retrying.",
        "Re-run dispatch after the Agent Ops API and sandbox executor are healthy.",
    ],
}

NO_PATCH_APPROVAL_HINT = "No PR path: executor finished without a patch. Retry execution after review."
EXECUTION_ERROR_APPROVAL_HINT = "No PR path: executor crashed or failed before producing a patch."


def normalize_failure_kind(kind: Optional[str], *, default: str = FAILURE_KIND_NO_PATCH) -> str:
    normalized = str(kind or "").strip().lower()
    if normalized in {FAILURE_KIND_NO_PATCH, FAILURE_KIND_EXECUTION_ERROR}:
        return normalized
    return default


def failure_label(kind: str) -> str:
    return FAILURE_LABELS.get(normalize_failure_kind(kind), "Execution incomplete")


def retry_instructions_for(kind: str) -> list[str]:
    return list(RETRY_INSTRUCTIONS.get(normalize_failure_kind(kind), RETRY_INSTRUCTIONS[FAILURE_KIND_NO_PATCH]))


def validation_notes_for(kind: str, reason: str, *, source: Optional[str] = None) -> list[str]:
    label = failure_label(kind)
    prefix = f"[proactive:{normalize_failure_kind(kind)}]"
    if source:
        prefix = f"{prefix}[{source}]"
    lines = [f"{prefix} {label}: {reason}".strip()]
    lines.extend(f"Retry: {step}" for step in retry_instructions_for(kind))
    return lines


def approval_instructions_for(kind: str) -> list[str]:
    if normalize_failure_kind(kind) == FAILURE_KIND_EXECUTION_ERROR:
        return [EXECUTION_ERROR_APPROVAL_HINT, *RETRY_INSTRUCTIONS[FAILURE_KIND_EXECUTION_ERROR][:1]]
    return [NO_PATCH_APPROVAL_HINT, *RETRY_INSTRUCTIONS[FAILURE_KIND_NO_PATCH][:1]]


def persist_run_failure(
    run: dict[str, Any],
    *,
    failure_kind: str,
    reason: str,
    source: Optional[str] = None,
) -> dict[str, Any]:
    kind = normalize_failure_kind(failure_kind)
    artifacts = run.setdefault("artifacts", {})
    artifacts["failureCategory"] = kind
    validation = artifacts.setdefault(
        "validation",
        {"overallStatus": "not_run", "commands": [], "notes": []},
    )
    if kind == FAILURE_KIND_EXECUTION_ERROR:
        validation["overallStatus"] = "failed"
    notes = validation.setdefault("notes", [])
    for line in validation_notes_for(kind, reason, source=source):
        if line not in notes:
            notes.append(line)
    approval = run.setdefault("approval", {})
    approval.setdefault("status", "pending")
    approval["instructions"] = approval_instructions_for(kind)
    return run


def build_candidate_failure_metadata(
    *,
    failure_kind: str,
    reason: str,
    source: Optional[str] = None,
    policy_visibility: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    kind = normalize_failure_kind(failure_kind)
    metadata: dict[str, Any] = {
        "internalOnly": True,
        "autoOpenPr": False,
        "requiresPatchExecutor": True,
        "patchBacked": False,
        "prApprovalBlocked": True,
        "executionFailureKind": kind,
        "executionReason": reason,
        "failureLabel": failure_label(kind),
        "retryInstructions": retry_instructions_for(kind),
        "executorSource": source,
        "isNoPatch": kind == FAILURE_KIND_NO_PATCH,
        "isBackendCrash": kind == FAILURE_KIND_EXECUTION_ERROR,
    }
    if policy_visibility:
        metadata["policyStatus"] = policy_visibility.get("policyStatus")
        metadata["policySummary"] = policy_visibility.get("policySummary")
        metadata["policyViolations"] = list(policy_visibility.get("policyViolations") or [])
        metadata["policyWarnings"] = list(policy_visibility.get("policyWarnings") or [])
        metadata["policyBlockReasons"] = list(policy_visibility.get("policyBlockReasons") or [])
        metadata["prApprovalBlocked"] = bool(policy_visibility.get("prApprovalBlocked", True))
        metadata["prPromotionDiscouraged"] = bool(policy_visibility.get("prPromotionDiscouraged"))
    elif source == "policy_gate":
        metadata["policyStatus"] = "blocked"
        metadata["policyBlockReasons"] = [reason]
        metadata["policyViolations"] = [reason]
    return metadata


def summarize_execution_failure(
    candidate: dict[str, Any],
    linked_run: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    metadata = candidate.get("reviewMetadata") or {}
    kind = metadata.get("executionFailureKind")
    if not kind:
        linked_category = (linked_run or {}).get("failureCategory") if linked_run else None
        if linked_category in {FAILURE_KIND_NO_PATCH, FAILURE_KIND_EXECUTION_ERROR}:
            kind = linked_category
        else:
            return None
    kind = normalize_failure_kind(str(kind))
    reason = str(metadata.get("executionReason") or "").strip()
    if not reason and linked_run:
        notes = ((linked_run.get("validation") or {}).get("notes")) or []
        reason = str(notes[0]) if notes else ""
    payload: dict[str, Any] = {
        "kind": kind,
        "label": metadata.get("failureLabel") or failure_label(kind),
        "reason": reason,
        "retryInstructions": metadata.get("retryInstructions") or retry_instructions_for(kind),
        "isNoPatch": kind == FAILURE_KIND_NO_PATCH,
        "isBackendCrash": kind == FAILURE_KIND_EXECUTION_ERROR,
        "executorSource": metadata.get("executorSource"),
    }
    violations = metadata.get("policyViolations") or (linked_run or {}).get("policyViolations")
    if violations:
        payload["policyViolations"] = [str(item).strip() for item in violations if str(item).strip()]
        payload["policyStatus"] = metadata.get("policyStatus") or (linked_run or {}).get("policyStatus")
        payload["policySummary"] = metadata.get("policySummary") or (linked_run or {}).get("policySummary")
        payload["prApprovalBlocked"] = bool(
            metadata.get("prApprovalBlocked") or (linked_run or {}).get("prApprovalBlocked"),
        )
    return payload
