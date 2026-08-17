from __future__ import annotations

from typing import Any, Optional

VALIDATION_COVERAGE_FULL = "full"
VALIDATION_COVERAGE_PARTIAL = "partial"
VALIDATION_COVERAGE_MISSING = "missing"


def _normalized_changed_files(changed_files: Optional[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in changed_files or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        if path:
            rows.append(item)
    return rows


def assess_validation_coverage(validation: Optional[dict[str, Any]]) -> str:
    if not isinstance(validation, dict):
        return VALIDATION_COVERAGE_MISSING

    status = str(validation.get("overallStatus") or "not_run").strip().lower()
    commands = validation.get("commands") or []
    has_commands = isinstance(commands, list) and len(commands) > 0

    if status == "passed" and has_commands:
        return VALIDATION_COVERAGE_FULL
    if status in {"passed", "partial"} or has_commands:
        return VALIDATION_COVERAGE_PARTIAL
    if status in {"failed"} and has_commands:
        return VALIDATION_COVERAGE_PARTIAL
    return VALIDATION_COVERAGE_MISSING


def validation_coverage_summary(coverage: str) -> str:
    if coverage == VALIDATION_COVERAGE_FULL:
        return "Validation commands ran and reported a passing overall status."
    if coverage == VALIDATION_COVERAGE_PARTIAL:
        return "Validation ran partially or reported a non-passing overall status; review logs before PR approval."
    return "Validation did not run or no command output was captured; internal review is still available for the patch."


def assess_review_ready_package(
    *,
    patch: str,
    changed_files: Optional[list[dict[str, Any]]],
    artifact_paths: Optional[dict[str, Any]],
    validation: Optional[dict[str, Any]],
    quality_gates: Optional[dict[str, Any]],
    policy_violations: Optional[list[str]] = None,
    sensitive_paths: Optional[list[str]] = None,
) -> dict[str, Any]:
    missing: list[str] = []
    patch_text = (patch or "").strip()
    files = _normalized_changed_files(changed_files)
    paths = {
        key: value
        for key, value in (artifact_paths or {}).items()
        if str(value or "").strip()
    }

    if not patch_text:
        missing.append("non_empty_patch")
    if not files:
        missing.append("changed_files")
    if not paths:
        missing.append("saved_artifacts")
    if not isinstance(quality_gates, dict) or "gates" not in quality_gates:
        missing.append("quality_gate_metadata")
    if not isinstance(validation, dict) or "overallStatus" not in validation:
        missing.append("validation_metadata")

    from proactive_policy_visibility import assess_policy_visibility

    visibility = assess_policy_visibility(
        violations=policy_violations,
        sensitive_paths=sensitive_paths,
    )
    violations = list(visibility["policyViolations"])
    policy_warnings = list(visibility["policyWarnings"])
    policy_blocked = bool(violations)
    validation_coverage = assess_validation_coverage(validation if isinstance(validation, dict) else None)

    eligible = not missing and not policy_blocked
    ineligible_reason = ""
    if policy_blocked:
        ineligible_reason = "; ".join(violations)
    elif missing:
        ineligible_reason = f"Missing review-ready requirements: {', '.join(missing)}."

    return {
        "eligible": eligible,
        "missingRequirements": missing,
        "policyBlocked": policy_blocked,
        "policyViolations": violations,
        "policyWarnings": policy_warnings,
        "policyStatus": visibility["policyStatus"],
        "policySummary": visibility["policySummary"],
        "prApprovalBlocked": visibility["prApprovalBlocked"],
        "prPromotionDiscouraged": visibility["prPromotionDiscouraged"],
        "sensitivePaths": list(visibility["sensitivePaths"]),
        "validationCoverage": validation_coverage,
        "validationSummary": validation_coverage_summary(validation_coverage),
        "qualityRecommendation": (quality_gates or {}).get("recommendation") if isinstance(quality_gates, dict) else None,
        "artifactPathCount": len(paths),
        "changedFileCount": len(files),
        "ineligibleReason": ineligible_reason,
        "requiresHumanApproval": True,
    }


def build_review_ready_metadata(
    assessment: dict[str, Any],
    *,
    workspace_path: str,
    changed_files: list[dict[str, Any]],
) -> dict[str, Any]:
    files = _normalized_changed_files(changed_files)
    return {
        "internalOnly": False,
        "autoOpenPr": False,
        "requiresPatchExecutor": False,
        "requiresHumanApproval": True,
        "patchBacked": True,
        "prApprovalBlocked": bool(assessment.get("prApprovalBlocked")),
        "prPromotionDiscouraged": bool(assessment.get("prPromotionDiscouraged")),
        "workspacePath": workspace_path,
        "changedFiles": [str(item.get("path") or "") for item in files[:8]],
        "validationCoverage": assessment.get("validationCoverage"),
        "validationSummary": assessment.get("validationSummary"),
        "qualityRecommendation": assessment.get("qualityRecommendation"),
        "policyStatus": assessment.get("policyStatus"),
        "policySummary": assessment.get("policySummary"),
        "policyViolations": list(assessment.get("policyViolations") or []),
        "policyWarnings": list(assessment.get("policyWarnings") or []),
        "policyBlockReasons": list(assessment.get("policyViolations") or []),
        "sensitivePaths": list(assessment.get("sensitivePaths") or []),
        "reviewReadyAssessment": {
            "eligible": True,
            "validationCoverage": assessment.get("validationCoverage"),
            "validationSummary": assessment.get("validationSummary"),
            "qualityRecommendation": assessment.get("qualityRecommendation"),
            "changedFileCount": assessment.get("changedFileCount"),
            "artifactPathCount": assessment.get("artifactPathCount"),
            "requiresHumanApproval": True,
            "policyStatus": assessment.get("policyStatus"),
            "policySummary": assessment.get("policySummary"),
            "policyViolations": list(assessment.get("policyViolations") or []),
            "policyWarnings": list(assessment.get("policyWarnings") or []),
            "prApprovalBlocked": bool(assessment.get("prApprovalBlocked")),
            "prPromotionDiscouraged": bool(assessment.get("prPromotionDiscouraged")),
        },
    }
