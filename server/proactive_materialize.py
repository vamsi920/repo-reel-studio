from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Callable, Optional

from agent_runs import append_timeline, now_iso, read_run, write_run
from layman_compress_helper import compress_prompt_prose_safe
from proactive_branch_name import build_proactive_branch_name

MaterializePhase = str

PHASE_RUN_STATUS: dict[MaterializePhase, str] = {
    "run_linked": "preparing",
    "workspace_ready": "running",
    "executor_started": "running",
    "validating": "running",
    "review_ready": "awaiting_review",
    "no_patch": "failed",
    "execution_error": "failed",
    "cancelled": "cancelled",
    "timed_out": "failed",
}

PHASE_CANDIDATE_STATUS: dict[MaterializePhase, str] = {
    "run_linked": "executing",
    "workspace_ready": "executing",
    "executor_started": "executing",
    "validating": "executing",
    "review_ready": "review_ready",
    "no_patch": "needs_execution",
    "execution_error": "needs_execution",
    "cancelled": "needs_execution",
    "timed_out": "needs_execution",
}

PHASE_CANDIDATE_STAGE: dict[MaterializePhase, str] = {
    "run_linked": "preparing",
    "workspace_ready": "patching",
    "executor_started": "patching",
    "validating": "validating",
    "review_ready": "review_ready",
    "no_patch": "needs_execution",
    "execution_error": "needs_execution",
    "cancelled": "cancelled",
    "timed_out": "timed_out",
}

PHASE_RUN_TIMELINE: dict[MaterializePhase, tuple[str, str, str]] = {
    "run_linked": ("created", "Proactive run created", "Linked candidate to Agent Ops sandbox run."),
    "workspace_ready": ("workspace", "Candidate workspace ready", "Isolated sandbox workspace prepared from discovery checkout."),
    "executor_started": ("patching", "Executor started", "Sandbox executor is analyzing the candidate."),
    "validating": ("validating", "Validation collecting", "Collecting patch and validation artifacts."),
    "review_ready": ("review", "Patch-backed review ready", "Patch and validation artifacts are ready for human review."),
    "no_patch": ("needs_execution", "Execution produced no patch", ""),
    "execution_error": ("error", "Execution failed", ""),
    "cancelled": ("cancel", "Run cancelled", "Linked Agent Ops run cancellation stopped proactive execution."),
    "timed_out": ("timeout", "Executor timed out", "Sandbox executor exceeded the proactive timeout budget."),
}

PATCH_READY_APPROVAL = ["Human approval can open a PR for this patch-backed candidate."]
NO_PATCH_APPROVAL = ["No patch artifact exists; rerun execution before PR approval."]
BLOCKED_PR_APPROVAL = [
    "PR approval is blocked until a new sandbox execution produces a patch.",
    "Cancelled or timed-out runs cannot be promoted to a pull request.",
]
INITIAL_APPROVAL = ["Approve only after sandbox patch artifacts are present."]


def repo_name(repo_url: str) -> str:
    cleaned = (repo_url or "").strip().rstrip("/")
    if cleaned.endswith(".git"):
        cleaned = cleaned[:-4]
    return cleaned.split("/")[-1] if cleaned else "repository"


def repo_display_name(repo_url: str) -> str:
    return repo_name(repo_url) or "repository"


def candidate_run_id(candidate: dict[str, Any]) -> str:
    run_id = str(candidate.get("runId") or "").strip()
    if not run_id:
        raise ValueError("candidate missing runId")
    return run_id


def assert_materialize_consistency(candidate: dict[str, Any], run: dict[str, Any]) -> None:
    run_id = candidate_run_id(candidate)
    if run.get("id") != run_id:
        raise AssertionError(f"runId mismatch: candidate={run_id} run={run.get('id')}")

    expected_status = PHASE_CANDIDATE_STATUS.get(_phase_from_run(run), candidate.get("status"))
    run_status = run.get("status")
    if run_status == "cancelled":
        if candidate.get("status") != "needs_execution":
            raise AssertionError("cancelled run requires candidate needs_execution")
        if candidate.get("stage") not in {"cancelled", "needs_execution"}:
            raise AssertionError("cancelled run requires candidate stage cancelled")
    elif run_status == "failed" and (run.get("artifacts") or {}).get("failureCategory") == "timeout":
        if candidate.get("status") != "needs_execution" or candidate.get("stage") not in {"timed_out", "needs_execution"}:
            raise AssertionError("timed out run requires candidate needs_execution with timed_out stage")
    elif run_status in PHASE_RUN_STATUS.values():
        for phase, status in PHASE_RUN_STATUS.items():
            if status == run_status and PHASE_CANDIDATE_STATUS[phase] == candidate.get("status"):
                expected_stage = PHASE_CANDIDATE_STAGE[phase]
                if candidate.get("stage") != expected_stage:
                    if run_status == "running" and candidate.get("stage") in {"patching", "validating"}:
                        pass
                    else:
                        raise AssertionError(
                            f"stage mismatch for run={run_status}: "
                            f"candidate stage={candidate.get('stage')} expected one of patching/validating or {expected_stage}"
                        )
                break

    review_ready = bool(candidate.get("reviewReady"))
    if review_ready != (candidate.get("status") == "review_ready"):
        raise AssertionError("reviewReady must match review_ready status")

    approval = run.get("approval") or {}
    if approval.get("status") not in (None, "pending", "approved", "rejected"):
        raise AssertionError("unexpected approval.status")
    if review_ready and approval.get("status") != "pending":
        raise AssertionError("review_ready run should keep approval pending until human action")
    if run_status in {"cancelled", "failed"} and (run.get("artifacts") or {}).get("failureCategory") in {
        "cancelled",
        "timeout",
    }:
        instructions = " ".join(approval.get("instructions") or [])
        if "blocked" not in instructions.lower() and "rerun" not in instructions.lower():
            raise AssertionError("cancelled/timed out runs must block PR approval path in instructions")

    proactive = run.get("proactive") or {}
    if proactive.get("candidateId") != candidate.get("id"):
        raise AssertionError("run.proactive.candidateId must match candidate.id")
    if proactive.get("batchId") != candidate.get("batchId"):
        raise AssertionError("run.proactive.batchId must match candidate.batchId")


def _phase_from_run(run: dict[str, Any]) -> MaterializePhase:
    status = run.get("status")
    if status == "preparing":
        return "run_linked"
    if status == "running":
        return "executor_started"
    if status == "awaiting_review":
        return "review_ready"
    if status == "cancelled":
        return "cancelled"
    if status == "failed":
        failure = (run.get("artifacts") or {}).get("failureCategory")
        if failure == "timeout":
            return "timed_out"
        if failure == "cancelled":
            return "cancelled"
        return "execution_error" if failure == "execution_error" else "no_patch"
    return "run_linked"


def apply_candidate_materialize_state(
    candidate: dict[str, Any],
    phase: MaterializePhase,
    *,
    run_id: Optional[str] = None,
) -> dict[str, Any]:
    if run_id:
        candidate["runId"] = run_id
    candidate["status"] = PHASE_CANDIDATE_STATUS[phase]
    candidate["stage"] = PHASE_CANDIDATE_STAGE[phase]
    candidate["reviewReady"] = phase == "review_ready"
    candidate["updatedAt"] = now_iso()
    return candidate


def apply_run_materialize_state(
    run: dict[str, Any],
    phase: MaterializePhase,
    *,
    workspace_path: Optional[str] = None,
    reason: str = "",
    completed: bool = False,
) -> dict[str, Any]:
    run["status"] = PHASE_RUN_STATUS[phase]
    run["updatedAt"] = now_iso()
    if workspace_path:
        run.setdefault("artifacts", {})["workspacePath"] = workspace_path

    approval = run.setdefault("approval", {})
    approval.setdefault("status", "pending")
    if phase == "review_ready":
        approval["instructions"] = list(PATCH_READY_APPROVAL)
    elif phase in {"no_patch", "execution_error"}:
        from proactive_no_patch_failure import (
            FAILURE_KIND_EXECUTION_ERROR,
            FAILURE_KIND_NO_PATCH,
            approval_instructions_for,
        )

        kind = FAILURE_KIND_EXECUTION_ERROR if phase == "execution_error" else FAILURE_KIND_NO_PATCH
        approval["instructions"] = approval_instructions_for(kind)
        run.setdefault("artifacts", {})["failureCategory"] = kind
    elif phase == "cancelled":
        approval["instructions"] = list(BLOCKED_PR_APPROVAL)
        run.setdefault("artifacts", {})["failureCategory"] = "cancelled"
    elif phase == "timed_out":
        approval["instructions"] = list(BLOCKED_PR_APPROVAL)
        run.setdefault("artifacts", {})["failureCategory"] = "timeout"
    elif phase == "run_linked":
        approval["instructions"] = list(INITIAL_APPROVAL)

    artifacts = run.setdefault("artifacts", {})
    validation = artifacts.setdefault("validation", {"overallStatus": "not_run", "commands": [], "notes": []})
    if phase in {"no_patch", "execution_error", "cancelled", "timed_out"} and reason:
        validation.setdefault("notes", []).append(reason)

    if completed:
        run["completedAt"] = now_iso()
    return run


def append_run_phase_timeline(
    run_id: str,
    phase: MaterializePhase,
    *,
    detail: str = "",
    level: str = "info",
) -> None:
    kind, title, default_detail = PHASE_RUN_TIMELINE[phase]
    append_timeline(run_id, kind, title, detail or default_detail, level=level)


def sync_materialize_pair(
    candidate: dict[str, Any],
    run: dict[str, Any],
    phase: MaterializePhase,
    *,
    workspace_path: Optional[str] = None,
    reason: str = "",
    timeline: bool = True,
    completed: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    run_id = candidate_run_id(candidate) if candidate.get("runId") else str(run.get("id") or "")
    if not run_id:
        raise ValueError("sync_materialize_pair requires run id on candidate or run")
    apply_candidate_materialize_state(candidate, phase, run_id=run_id)
    apply_run_materialize_state(
        run,
        phase,
        workspace_path=workspace_path,
        reason=reason,
        completed=completed,
    )
    assert_materialize_consistency(candidate, run)
    write_run(run)
    if timeline:
        level = "warning" if phase in {"no_patch", "execution_error", "cancelled", "timed_out"} else "info"
        append_run_phase_timeline(run_id, phase, detail=reason, level=level)
    return candidate, run


def build_proactive_run_record(
    candidate: dict[str, Any],
    run_id: str,
    *,
    repo_head: Optional[str] = None,
    created: Optional[str] = None,
    context_hints: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    from proactive_context_hints import merge_run_context_hints

    created = created or now_iso()
    title = candidate["title"]
    compressed_hypothesis = compress_prompt_prose_safe(str(candidate.get("hypothesis") or ""))
    compressed_evidence = [
        compress_prompt_prose_safe(str(item))
        for item in list(candidate.get("evidence") or [])
    ]
    body = "\n".join([candidate["hypothesis"], "", "Evidence:", *[f"- {item}" for item in candidate["evidence"]]])
    focus_path = candidate["dedupeKey"].split(":", 1)[0]
    merged_hints = merge_run_context_hints(focus_path, context_hints)
    candidate_evidence = len(candidate.get("evidence") or [])
    merged_hints["evidenceCount"] = max(int(merged_hints.get("evidenceCount") or 0), candidate_evidence)
    merged_hints["snippetCount"] = max(int(merged_hints.get("snippetCount") or 0), candidate_evidence)
    return {
        "id": run_id,
        "status": PHASE_RUN_STATUS["run_linked"],
        "createdAt": created,
        "updatedAt": created,
        "startedAt": created,
        "completedAt": None,
        "projectId": candidate.get("projectId"),
        "repoUrl": candidate["repoUrl"],
        "repoName": candidate.get("repoName") or repo_display_name(candidate["repoUrl"]),
        "issueUrl": f"proactive://candidate/{candidate['id']}",
        "branch": None,
        "issue": None,
        "contextHints": merged_hints,
        "plan": {
            "summary": title,
            "strategy": compress_prompt_prose_safe(
                "Run proactive execution in an isolated sandbox; PR creation remains human-approved."
            ),
            "tasks": [
                {"title": "Investigate", "detail": compressed_hypothesis},
                {
                    "title": "Patch",
                    "detail": compress_prompt_prose_safe(
                        "Run the normal OpenDevin executor against this proactive candidate."
                    ),
                },
                {
                    "title": "Validate",
                    "detail": compress_prompt_prose_safe("Use detected repo validation before approval."),
                },
            ],
            "risks": [
                compress_prompt_prose_safe("Execution may produce no patch."),
                compress_prompt_prose_safe("Approval is blocked until patch artifacts exist."),
            ],
            "validation_focus": compressed_evidence[:4],
        },
        "timeline": [],
        "policyViolations": [],
        "policy": {
            "commandAllowlist": [
                "git diff --check",
                "git diff",
                "git status",
                "npm test",
                "npm run lint",
                "npm run build",
                "python -m pytest",
            ],
            "pathDenylist": [
                ".git/**",
                ".env*",
                "**/.env*",
                "node_modules/**",
                "dist/**",
                "build/**",
                "coverage/**",
                "**/*.pem",
                "**/secrets/**",
            ],
            "networkPolicy": "restricted — runner-managed commands only; no ad-hoc network installs",
        },
        "control": {"cancelRequested": False},
        "artifacts": {
            "workspacePath": None,
            "patch": "",
            "diffStat": "",
            "changedFiles": [],
            "validation": {
                "overallStatus": "not_run",
                "commands": [],
                "notes": ["Proactive candidate staged. Sandbox execution will attempt to produce patch artifacts."],
            },
            "prDraft": {"title": title, "body": body},
            "prReadable": {
                "title": title,
                "sections": [
                    {"heading": "Opportunity", "body": compressed_hypothesis, "kind": "summary"},
                    {"heading": "Evidence", "body": "\n".join(compressed_evidence), "kind": "notes"},
                    {
                        "heading": "Next step",
                        "body": compress_prompt_prose_safe(
                            "Review executor output, then approve only if patch artifacts validate."
                        ),
                        "kind": "checklist",
                    },
                ],
                "checklist": [
                    {"label": "Patch created in sandbox", "checked": False},
                    {"label": "Validation passed", "checked": False},
                    {"label": "Human approved PR creation", "checked": False},
                ],
                "reviewerPrompts": [
                    compress_prompt_prose_safe(
                        "No PR will open until this candidate has a patch and is approved."
                    )
                ],
            },
            "testMatrix": None,
            "qualityGates": {
                "gates": [
                    {"gate": "diff_check", "status": "not_run", "detail": "No proactive patch yet."},
                    {"gate": "test", "status": "not_run", "detail": "Validation awaits execution."},
                ],
                "allPassed": False,
                "recommendation": "review",
            },
            "changeIntent": {
                "issueTitle": title,
                "issueNumber": None,
                "planSummary": title,
                "hypothesis": compressed_hypothesis,
                "selfCritique": compress_prompt_prose_safe(
                    "Static discovery selected this candidate; executor output determines promotion readiness."
                ),
                "taskBreakdown": [
                    {
                        "title": "Observed",
                        "detail": compressed_evidence[0] if compressed_evidence else "Static signal found.",
                        "status": "done",
                        "acceptanceMet": True,
                    },
                    {
                        "title": "Investigating",
                        "detail": compress_prompt_prose_safe(
                            "Candidate ranked by deterministic quality gates."
                        ),
                        "status": "done",
                        "acceptanceMet": True,
                    },
                    {
                        "title": "Patching",
                        "detail": compress_prompt_prose_safe("Sandbox execution queued for this dispatch."),
                        "status": "pending",
                        "acceptanceMet": False,
                    },
                    {
                        "title": "Validating",
                        "detail": compress_prompt_prose_safe("Not run yet."),
                        "status": "skipped",
                        "acceptanceMet": False,
                    },
                ],
                "blastRadius": [focus_path],
                "evidenceSufficiency": "strong" if candidate["score"]["total"] >= 0.78 else "moderate",
            },
            "artifactPaths": {},
            "failureCategory": None,
        },
        "evaluation": {
            "riskLevel": "low" if candidate["score"]["risk"] >= 0.75 else "medium",
            "riskScore": round(1 - candidate["score"]["risk"], 2),
            "riskReasons": [compress_prompt_prose_safe("Static candidate; no files changed yet.")],
            "confidenceLevel": "high" if candidate["score"]["total"] >= 0.78 else "medium",
            "confidenceScore": candidate["score"]["total"],
            "confidenceReasons": compressed_evidence[:3],
        },
        "metrics": {
            "totalTokensUsed": 0,
            "planningAttempts": 1,
            "patchAttempts": 0,
            "critiqueIterations": 0,
            "validationDepth": 0,
            "artifactConfidence": candidate["score"]["total"],
        },
        "approval": {
            "status": "pending",
            "branchName": build_proactive_branch_name(
                candidate_id=str(candidate["id"]),
                run_id=run_id,
                repo_name=repo_name(candidate["repoUrl"]),
                title=str(candidate.get("title") or ""),
                candidate_type=str(candidate.get("type") or ""),
            ),
            "instructions": list(INITIAL_APPROVAL),
            "approvedAt": None,
            "rejectedAt": None,
            "prUrl": None,
            "commitSha": repo_head,
            "promotionLog": [],
        },
        "proactive": {"candidateId": candidate["id"], "batchId": candidate["batchId"]},
    }


RunnerFactory = Callable[[str, dict[str, Any], Optional[dict[str, Any]]], Any]
