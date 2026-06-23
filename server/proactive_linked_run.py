from __future__ import annotations

from typing import Any, Optional

LINKED_RUN_STDOUT_LIMIT = 12_000
LINKED_RUN_STDERR_LIMIT = 12_000
LINKED_RUN_NOTE_LIMIT = 2_000
LINKED_RUN_CHANGED_FILES_LIMIT = 64
LINKED_RUN_VALIDATION_COMMANDS_LIMIT = 32

EMPTY_TEST_MATRIX: dict[str, Any] = {
    "suites": [],
    "overallStatus": "not_run",
    "totalDurationMs": 0,
    "passRate": 0.0,
}

DEFAULT_QUALITY_GATES: dict[str, Any] = {
    "recommendation": "review",
    "allPassed": False,
    "gates": [],
}


def truncate_linked_run_text(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def normalize_validation_command(raw: Any) -> Optional[dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    command = str(raw.get("command") or "").strip()
    if not command:
        return None
    kind = str(raw.get("kind") or "").strip().lower()
    normalized_kind = kind if kind in {"install", "validation"} else None
    item: dict[str, Any] = {
        "command": command,
        "exitCode": int(raw.get("exitCode") if raw.get("exitCode") is not None else -1),
        "stdout": truncate_linked_run_text(raw.get("stdout"), LINKED_RUN_STDOUT_LIMIT),
        "stderr": truncate_linked_run_text(raw.get("stderr"), LINKED_RUN_STDERR_LIMIT),
        "durationMs": max(0, int(raw.get("durationMs") or 0)),
    }
    if normalized_kind:
        item["kind"] = normalized_kind
    return item


def normalize_validation_block(raw: Any) -> dict[str, Any]:
    data = raw if isinstance(raw, dict) else {}
    commands_raw = data.get("commands") if isinstance(data.get("commands"), list) else []
    commands: list[dict[str, Any]] = []
    for entry in commands_raw[:LINKED_RUN_VALIDATION_COMMANDS_LIMIT]:
        normalized = normalize_validation_command(entry)
        if normalized:
            commands.append(normalized)

    notes_raw = data.get("notes") if isinstance(data.get("notes"), list) else []
    notes = [
        truncate_linked_run_text(note, LINKED_RUN_NOTE_LIMIT)
        for note in notes_raw
        if str(note or "").strip()
    ]

    overall = str(data.get("overallStatus") or "not_run").strip().lower()
    if overall not in {"passed", "partial", "failed", "not_run"}:
        overall = "not_run"

    return {
        "overallStatus": overall,
        "commands": commands,
        "notes": notes,
    }


def normalize_changed_files(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    rows: list[dict[str, Any]] = []
    for item in raw[:LINKED_RUN_CHANGED_FILES_LIMIT]:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "").strip()
        if not path:
            continue
        additions = max(0, int(item.get("additions") or 0))
        deletions = max(0, int(item.get("deletions") or 0))
        changed_lines = int(item.get("changedLines") or additions + deletions)
        rows.append(
            {
                "path": path,
                "additions": additions,
                "deletions": deletions,
                "changedLines": max(0, changed_lines),
                "sensitive": bool(item.get("sensitive")),
            }
        )
    return rows


def normalize_test_matrix(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return dict(EMPTY_TEST_MATRIX)

    suites_raw = raw.get("suites") if isinstance(raw.get("suites"), list) else []
    suites: list[dict[str, Any]] = []
    for item in suites_raw:
        if not isinstance(item, dict):
            continue
        command = str(item.get("command") or "").strip()
        if not command:
            continue
        status = str(item.get("status") or "failed").strip().lower()
        if status not in {"passed", "failed", "skipped", "timeout"}:
            status = "failed"
        impacted = [
            str(path).strip()
            for path in (item.get("impactedFiles") or [])
            if str(path).strip()
        ][:8]
        suites.append(
            {
                "suite": str(item.get("suite") or "check"),
                "command": command,
                "status": status,
                "durationMs": max(0, int(item.get("durationMs") or 0)),
                "exitCode": int(item.get("exitCode") if item.get("exitCode") is not None else -1),
                "failureSummary": truncate_linked_run_text(item.get("failureSummary"), 500) or None,
                "impactedFiles": impacted,
                "logRef": str(item.get("logRef")).strip() if item.get("logRef") else None,
            }
        )

    overall = str(raw.get("overallStatus") or "not_run").strip().lower()
    if overall not in {"passed", "partial", "failed", "not_run"}:
        overall = "not_run"

    total_duration = max(0, int(raw.get("totalDurationMs") or 0))
    try:
        pass_rate = float(raw.get("passRate") if raw.get("passRate") is not None else 0.0)
    except (TypeError, ValueError):
        pass_rate = 0.0
    pass_rate = max(0.0, min(1.0, pass_rate))

    return {
        "suites": suites,
        "overallStatus": overall,
        "totalDurationMs": total_duration,
        "passRate": round(pass_rate, 2),
    }


def normalize_quality_gates(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return dict(DEFAULT_QUALITY_GATES)

    gates_raw = raw.get("gates") if isinstance(raw.get("gates"), list) else []
    gates: list[dict[str, Any]] = []
    for item in gates_raw:
        if not isinstance(item, dict):
            continue
        gate = str(item.get("gate") or "").strip()
        if not gate:
            continue
        status = str(item.get("status") or "not_run").strip().lower()
        if status not in {"passed", "failed", "skipped", "not_run"}:
            status = "not_run"
        gates.append(
            {
                "gate": gate,
                "status": status,
                "detail": truncate_linked_run_text(item.get("detail"), 240) or None,
            }
        )

    recommendation = str(raw.get("recommendation") or "review").strip().lower()
    if recommendation not in {"ship", "review", "rework"}:
        recommendation = "review"

    all_passed = raw.get("allPassed")
    if all_passed is None:
        all_passed_value = False
    else:
        all_passed_value = bool(all_passed)

    return {
        "recommendation": recommendation,
        "allPassed": all_passed_value,
        "gates": gates,
    }


def normalize_change_intent(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"hypothesis": None, "evidenceSufficiency": None}
    sufficiency = str(raw.get("evidenceSufficiency") or "").strip().lower()
    if sufficiency not in {"strong", "moderate", "weak"}:
        sufficiency = None
    hypothesis = str(raw.get("hypothesis") or "").strip() or None
    return {"hypothesis": hypothesis, "evidenceSufficiency": sufficiency}


def build_linked_run_summary(run: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not isinstance(run, dict):
        return None

    run_id = str(run.get("id") or "").strip()
    if not run_id:
        return None

    artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), dict) else {}
    validation = normalize_validation_block(artifacts.get("validation"))
    quality_gates = normalize_quality_gates(artifacts.get("qualityGates"))
    test_matrix = normalize_test_matrix(artifacts.get("testMatrix"))
    changed_files = normalize_changed_files(artifacts.get("changedFiles"))
    change_intent = normalize_change_intent(artifacts.get("changeIntent"))

    issue = run.get("issue") if isinstance(run.get("issue"), dict) else {}
    plan = run.get("plan") if isinstance(run.get("plan"), dict) else {}
    issue_title = str(issue.get("title") or "").strip() or str(plan.get("summary") or "").strip() or None

    timeline = run.get("timeline") if isinstance(run.get("timeline"), list) else []

    from proactive_policy_visibility import policy_visibility_from_run

    policy = policy_visibility_from_run(run)

    return {
        "id": run_id,
        "status": str(run.get("status") or "unknown"),
        "updatedAt": run.get("updatedAt"),
        "startedAt": run.get("startedAt"),
        "completedAt": run.get("completedAt"),
        "failureCategory": str(artifacts.get("failureCategory") or "").strip() or None,
        "issueTitle": issue_title,
        "timeline": timeline,
        "validation": validation,
        "changedFiles": changed_files,
        "diffStat": truncate_linked_run_text(artifacts.get("diffStat"), 16_000),
        "hasPatch": bool(str(artifacts.get("patch") or "").strip()),
        "testMatrix": test_matrix,
        "qualityGates": quality_gates,
        "changeIntent": change_intent,
        "evaluation": run.get("evaluation") if isinstance(run.get("evaluation"), dict) else {},
        "policyViolations": list(policy["policyViolations"]),
        "policyWarnings": list(policy["policyWarnings"]),
        "policyStatus": policy["policyStatus"],
        "policySummary": policy["policySummary"],
        "prApprovalBlocked": bool(policy["prApprovalBlocked"]),
        "prPromotionDiscouraged": bool(policy["prPromotionDiscouraged"]),
        "sensitivePaths": list(policy["sensitivePaths"]),
        "sandboxPolicy": artifacts.get("sandboxPolicy") if isinstance(artifacts.get("sandboxPolicy"), dict) else None,
        "policyAudit": artifacts.get("policyAudit") if isinstance(artifacts.get("policyAudit"), dict) else None,
    }
