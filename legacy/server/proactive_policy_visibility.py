from __future__ import annotations

from typing import Any, Optional

POLICY_STATE_CLEAR = "clear"
POLICY_STATE_WARNING = "warning"
POLICY_STATE_BLOCKED = "blocked"


def _clean_lines(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    seen: set[str] = set()
    ordered: list[str] = []
    for item in values:
        text = str(item or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        ordered.append(text)
    return ordered


def sensitive_path_warnings(sensitive_paths: list[str]) -> list[str]:
    paths = _clean_lines(sensitive_paths)
    if not paths:
        return []
    return [f"Sensitive path touched: {path}" for path in paths]


def build_policy_summary(
    *,
    policy_status: str,
    violations: list[str],
    warnings: list[str],
) -> str:
    if policy_status == POLICY_STATE_BLOCKED:
        return f"PR promotion blocked: {len(violations)} policy violation(s)."
    if policy_status == POLICY_STATE_WARNING:
        return f"PR promotion discouraged: {len(warnings)} sensitive-path warning(s)."
    return "No proactive sandbox policy warnings."


def assess_policy_visibility(
    *,
    violations: Optional[list[str]] = None,
    sensitive_paths: Optional[list[str]] = None,
) -> dict[str, Any]:
    blocking = _clean_lines(violations)
    sensitive = _clean_lines(sensitive_paths)
    warnings = sensitive_path_warnings(sensitive)
    if blocking and sensitive:
        warnings.append(f"Sensitive paths also touched: {', '.join(sensitive[:8])}")

    if blocking:
        policy_status = POLICY_STATE_BLOCKED
        pr_approval_blocked = True
        pr_discouraged = True
    elif warnings:
        policy_status = POLICY_STATE_WARNING
        pr_approval_blocked = False
        pr_discouraged = True
    else:
        policy_status = POLICY_STATE_CLEAR
        pr_approval_blocked = False
        pr_discouraged = False

    return {
        "policyStatus": policy_status,
        "policyViolations": blocking,
        "policyWarnings": warnings if not blocking else warnings,
        "sensitivePaths": sensitive,
        "prApprovalBlocked": pr_approval_blocked,
        "prPromotionDiscouraged": pr_discouraged,
        "policySummary": build_policy_summary(
            policy_status=policy_status,
            violations=blocking,
            warnings=warnings,
        ),
        "policyBlockReasons": blocking,
    }


def policy_visibility_from_run(
    run: Optional[dict[str, Any]],
    *,
    candidate_metadata: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    metadata = candidate_metadata if isinstance(candidate_metadata, dict) else {}
    artifacts = (run or {}).get("artifacts") if isinstance((run or {}).get("artifacts"), dict) else {}
    sandbox = artifacts.get("sandboxPolicy") if isinstance(artifacts.get("sandboxPolicy"), dict) else {}
    audit = artifacts.get("policyAudit") if isinstance(artifacts.get("policyAudit"), dict) else {}

    violations = _clean_lines((run or {}).get("policyViolations"))
    if not violations:
        violations = _clean_lines(metadata.get("policyViolations"))
    if not violations:
        violations = _clean_lines(audit.get("violations"))

    sensitive = _clean_lines(sandbox.get("sensitivePaths"))
    if not sensitive:
        sensitive = _clean_lines(metadata.get("sensitivePaths"))

    visibility = assess_policy_visibility(violations=violations, sensitive_paths=sensitive)
    if metadata.get("prApprovalBlocked"):
        visibility["prApprovalBlocked"] = True
        if visibility["policyStatus"] == POLICY_STATE_CLEAR:
            visibility["policyStatus"] = POLICY_STATE_BLOCKED
    return visibility


def merge_policy_review_metadata(
    metadata: dict[str, Any],
    visibility: dict[str, Any],
    *,
    extra_reasons: Optional[list[str]] = None,
) -> dict[str, Any]:
    merged = dict(metadata)
    reasons = _clean_lines([*(visibility.get("policyBlockReasons") or []), *(extra_reasons or [])])
    merged.update(
        {
            "policyStatus": visibility.get("policyStatus"),
            "policyViolations": list(visibility.get("policyViolations") or []),
            "policyWarnings": list(visibility.get("policyWarnings") or []),
            "sensitivePaths": list(visibility.get("sensitivePaths") or []),
            "prApprovalBlocked": bool(visibility.get("prApprovalBlocked")),
            "prPromotionDiscouraged": bool(visibility.get("prPromotionDiscouraged")),
            "policySummary": visibility.get("policySummary"),
            "policyBlockReasons": reasons,
        }
    )
    return merged


def attach_policy_visibility_to_candidate(
    candidate: dict[str, Any],
    linked_run: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    enriched = dict(candidate)
    visibility = policy_visibility_from_run(linked_run, candidate_metadata=enriched.get("reviewMetadata"))
    enriched["policyStatus"] = visibility["policyStatus"]
    enriched["policySummary"] = visibility["policySummary"]
    enriched["policyViolations"] = list(visibility["policyViolations"])
    enriched["policyWarnings"] = list(visibility["policyWarnings"])
    enriched["prApprovalBlocked"] = visibility["prApprovalBlocked"]
    enriched["prPromotionDiscouraged"] = visibility["prPromotionDiscouraged"]
    metadata = dict(enriched.get("reviewMetadata") or {})
    enriched["reviewMetadata"] = merge_policy_review_metadata(metadata, visibility)
    return enriched
