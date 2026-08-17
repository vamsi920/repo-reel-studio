from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable, Optional

from proactive_linked_run import DEFAULT_QUALITY_GATES, EMPTY_TEST_MATRIX, build_linked_run_summary, normalize_validation_block

RECOVERY_LINKED_RUN_STATUS = "unavailable"
RECOVERY_CODE_MISSING_RUN = "missing_run"
RECOVERY_CODE_CORRUPT_RUN = "corrupt_run"
RECOVERY_CODE_READ_ERROR = "read_error"
RECOVERY_CODE_MISSING_WORKSPACE = "missing_workspace"
RECOVERY_CODE_VALIDATION_FAILED = "validation_failed"


def safe_read_agent_run(run_id: str) -> tuple[Optional[dict[str, Any]], Optional[str]]:
    """Read Agent Ops run JSON without raising; preserves corrupt files on disk."""
    normalized_id = str(run_id or "").strip()
    if not normalized_id:
        return None, RECOVERY_CODE_MISSING_RUN
    try:
        from agent_runs import run_json_path

        path = run_json_path(normalized_id)
    except Exception:
        return None, RECOVERY_CODE_READ_ERROR
    if not path.is_file():
        return None, RECOVERY_CODE_MISSING_RUN
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None, RECOVERY_CODE_CORRUPT_RUN
    except OSError:
        return None, RECOVERY_CODE_READ_ERROR
    if not isinstance(parsed, dict) or not parsed:
        return None, RECOVERY_CODE_CORRUPT_RUN
    return parsed, None


def build_unavailable_linked_run_summary(
    run_id: str,
    recovery_code: str,
    message: str,
    *,
    run: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    validation_status = "not_run"
    if recovery_code == RECOVERY_CODE_VALIDATION_FAILED:
        validation_status = "failed"
    elif recovery_code == RECOVERY_CODE_MISSING_WORKSPACE:
        validation_status = "partial"

    validation = normalize_validation_block(
        {
            "overallStatus": validation_status,
            "commands": ((run or {}).get("artifacts") or {}).get("validation", {}).get("commands")
            if isinstance((run or {}).get("artifacts"), dict)
            else [],
            "notes": [message],
        }
    )
    failure_category = None
    if recovery_code in {RECOVERY_CODE_CORRUPT_RUN, RECOVERY_CODE_READ_ERROR, RECOVERY_CODE_MISSING_RUN}:
        failure_category = "execution_error"
    elif recovery_code == RECOVERY_CODE_VALIDATION_FAILED:
        failure_category = "execution_error"
    elif recovery_code == RECOVERY_CODE_MISSING_WORKSPACE:
        failure_category = "execution_error"

    return {
        "id": run_id,
        "status": RECOVERY_LINKED_RUN_STATUS,
        "recoveryCode": recovery_code,
        "recoveryMessage": message,
        "updatedAt": (run or {}).get("updatedAt"),
        "startedAt": (run or {}).get("startedAt"),
        "completedAt": (run or {}).get("completedAt"),
        "failureCategory": failure_category,
        "issueTitle": None,
        "timeline": (run or {}).get("timeline") if isinstance((run or {}).get("timeline"), list) else [],
        "validation": validation,
        "changedFiles": [],
        "diffStat": "",
        "hasPatch": False,
        "testMatrix": dict(EMPTY_TEST_MATRIX),
        "qualityGates": dict(DEFAULT_QUALITY_GATES),
        "changeIntent": {"hypothesis": None, "evidenceSufficiency": None},
        "evaluation": {},
        "policyViolations": [],
        "policyWarnings": [],
        "policyStatus": "clear",
        "policySummary": "",
        "prApprovalBlocked": False,
        "prPromotionDiscouraged": False,
        "sensitivePaths": [],
        "sandboxPolicy": None,
        "policyAudit": None,
    }


def workspace_recovery_code(run: Optional[dict[str, Any]]) -> Optional[str]:
    if not isinstance(run, dict):
        return None
    artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), dict) else {}
    workspace_path = str(artifacts.get("workspacePath") or "").strip()
    if not workspace_path:
        return None
    if Path(workspace_path).exists():
        return None
    return RECOVERY_CODE_MISSING_WORKSPACE


def resolve_linked_run_summary(run_id: Optional[str]) -> Optional[dict[str, Any]]:
    normalized_id = str(run_id or "").strip()
    if not normalized_id:
        return None

    run, recovery_code = safe_read_agent_run(normalized_id)
    if recovery_code:
        messages = {
            RECOVERY_CODE_MISSING_RUN: "Linked Agent Ops run JSON was not found; candidate metadata preserved.",
            RECOVERY_CODE_CORRUPT_RUN: "Linked Agent Ops run JSON is unreadable; file left in place for repair.",
            RECOVERY_CODE_READ_ERROR: "Linked Agent Ops run could not be loaded.",
        }
        return build_unavailable_linked_run_summary(
            normalized_id,
            recovery_code,
            messages.get(recovery_code, "Linked run unavailable."),
            run=run,
        )

    workspace_code = workspace_recovery_code(run)
    if workspace_code:
        summary = build_linked_run_summary(run) or build_unavailable_linked_run_summary(
            normalized_id,
            workspace_code,
            "Sandbox workspace directory is missing; rerun dispatch or materialize to recreate it.",
            run=run,
        )
        if summary.get("status") != RECOVERY_LINKED_RUN_STATUS:
            summary = dict(summary)
            summary["recoveryCode"] = workspace_code
            summary["recoveryMessage"] = "Sandbox workspace directory is missing."
            notes = list((summary.get("validation") or {}).get("notes") or [])
            if summary["recoveryMessage"] not in notes:
                notes.insert(0, summary["recoveryMessage"])
            validation = dict(summary.get("validation") or {})
            validation["overallStatus"] = "partial"
            validation["notes"] = notes
            summary["validation"] = validation
        return summary

    validation = ((run or {}).get("artifacts") or {}).get("validation") if isinstance((run or {}).get("artifacts"), dict) else {}
    overall = str((validation or {}).get("overallStatus") or "").strip().lower()
    summary = build_linked_run_summary(run)
    if not summary:
        return build_unavailable_linked_run_summary(
            normalized_id,
            RECOVERY_CODE_READ_ERROR,
            "Linked run payload was empty.",
            run=run,
        )
    if overall == "failed":
        summary = dict(summary)
        summary["recoveryCode"] = RECOVERY_CODE_VALIDATION_FAILED
        summary["recoveryMessage"] = "One or more validation commands failed."
    return summary


def safe_enrich_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    try:
        return _enrich_candidate_inner(candidate)
    except Exception as exc:
        degraded = dict(candidate)
        degraded["linkedRun"] = None
        degraded["recovery"] = {
            "enrichment": "degraded",
            "message": str(exc) or "Candidate enrichment failed.",
        }
        return degraded


def _enrich_candidate_inner(candidate: dict[str, Any]) -> dict[str, Any]:
    from proactive_no_patch_failure import summarize_execution_failure
    from proactive_policy_visibility import attach_policy_visibility_to_candidate

    enriched = dict(candidate)
    linked = resolve_linked_run_summary(candidate.get("runId"))
    enriched["linkedRun"] = linked
    enriched = attach_policy_visibility_to_candidate(enriched, linked)
    failure = summarize_execution_failure(enriched, linked)
    if failure:
        enriched["executionFailure"] = failure
    elif linked and linked.get("recoveryCode"):
        enriched["executionFailure"] = {
            "kind": "execution_error",
            "label": "Linked run unavailable",
            "reason": str(linked.get("recoveryMessage") or ""),
            "retryInstructions": [
                "Confirm the linked Agent Ops run exists and is readable.",
                "Re-run proactive dispatch if workspace artifacts were removed.",
            ],
            "isNoPatch": False,
            "isBackendCrash": True,
            "executorSource": str(linked.get("recoveryCode") or ""),
        }
    review_meta = enriched.get("reviewMetadata") or {}
    if enriched.get("status") == "review_ready" and review_meta.get("reviewReadyAssessment"):
        enriched["reviewReadySummary"] = review_meta.get("reviewReadyAssessment")
    elif enriched.get("status") == "review_ready":
        linked_payload = enriched.get("linkedRun") or {}
        enriched["reviewReadySummary"] = {
            "validationCoverage": review_meta.get("validationCoverage"),
            "validationSummary": review_meta.get("validationSummary"),
            "qualityRecommendation": review_meta.get("qualityRecommendation"),
            "requiresHumanApproval": review_meta.get("requiresHumanApproval", True),
            "hasPatch": bool(linked_payload.get("hasPatch")),
            "policyStatus": enriched.get("policyStatus"),
            "policySummary": enriched.get("policySummary"),
            "policyViolations": enriched.get("policyViolations"),
            "policyWarnings": enriched.get("policyWarnings"),
            "prApprovalBlocked": enriched.get("prApprovalBlocked"),
            "prPromotionDiscouraged": enriched.get("prPromotionDiscouraged"),
        }
    if linked and linked.get("recoveryCode"):
        enriched["recovery"] = {
            "linkedRun": str(linked.get("recoveryCode") or ""),
            "message": str(linked.get("recoveryMessage") or ""),
        }
    return enriched


def safe_enrich_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [safe_enrich_candidate(candidate) for candidate in candidates]


def count_quarantined_records(repo_url: str, project_id: Optional[str] = None) -> int:
    from proactive_store import ensure_scope

    corrupt_dir = ensure_scope(repo_url, project_id) / ".corrupt"
    if not corrupt_dir.is_dir():
        return 0
    return len([path for path in corrupt_dir.glob("*.json") if path.is_file()])


def is_usable_candidate_record(item: dict[str, Any]) -> bool:
    return bool(str(item.get("id") or "").strip() and str(item.get("repoUrl") or "").strip())


def build_degraded_status_summary(
    repo_url: str,
    project_id: Optional[str],
    exc: BaseException,
    *,
    config: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    from proactive_store import default_config, get_config

    cfg = config or get_config(repo_url, project_id)
    if not cfg.get("repoUrl"):
        cfg = {**default_config(repo_url, project_id), **cfg}
    return {
        "config": cfg,
        "batch": None,
        "ready": 0,
        "target": max(1, min(int(cfg.get("targetCount") or 6), 6)),
        "candidates": [],
        "shortfallReason": "Proactive status recovered from a store read error.",
        "storeRecovery": {
            "degraded": True,
            "quarantinedRecords": count_quarantined_records(repo_url, project_id),
            "messages": [str(exc) or exc.__class__.__name__],
        },
    }


def safe_build_status_summary(
    repo_url: str,
    project_id: Optional[str] = None,
    *,
    config: Optional[dict[str, Any]] = None,
    enrich_fn: Callable[[list[dict[str, Any]]], list[dict[str, Any]]] = safe_enrich_candidates,
) -> dict[str, Any]:
    from proactive_status_summary import build_status_summary

    try:
        payload = build_status_summary(repo_url, project_id, config=config, enrich_fn=enrich_fn)
    except Exception as exc:
        return build_degraded_status_summary(repo_url, project_id, exc, config=config)

    quarantined = count_quarantined_records(repo_url, project_id)
    if quarantined:
        recovery = dict(payload.get("storeRecovery") or {})
        recovery["quarantinedRecords"] = quarantined
        messages = list(recovery.get("messages") or [])
        messages.append(f"{quarantined} corrupt store record(s) quarantined under .corrupt/.")
        recovery["messages"] = messages
        payload["storeRecovery"] = recovery
    return payload
