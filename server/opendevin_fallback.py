from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

from proactive_no_patch_failure import FAILURE_KIND_EXECUTION_ERROR, FAILURE_KIND_NO_PATCH

EXECUTOR_MODE_OPENDEVIN = "opendevin"
EXECUTOR_MODE_LEGACY = "legacy"
EXECUTOR_MODE_UNAVAILABLE = "unavailable"


def _check_command(cmd: str) -> bool:
    import shutil

    return shutil.which(cmd) is not None


def legacy_executor_enabled() -> bool:
    return os.getenv("PROACTIVE_DISABLE_LEGACY_EXECUTOR", "").strip().lower() not in (
        "1",
        "true",
        "yes",
    )


def describe_opendevin_availability() -> dict[str, Any]:
    channels: list[str] = []
    if os.getenv("OPENDEVIN_API_URL", "").strip():
        channels.append("api")
    cli_path = os.getenv("OPENDEVIN_PATH", "").strip()
    if cli_path and Path(cli_path).exists():
        channels.append("cli")
    if _check_command("docker") and os.getenv("OPENDEVIN_ENABLE_DOCKER_PROBE", "").strip().lower() in (
        "1",
        "true",
        "yes",
    ):
        channels.append("docker_probe")
    return {
        "channels": channels,
        "any_opendevin_channel": bool(channels),
        "legacy_enabled": legacy_executor_enabled(),
    }


def try_legacy_executor(
    workspace_path: str | Path,
    issue: dict[str, Any],
    *,
    context_hints: Optional[dict[str, Any]] = None,
) -> Any:
    from opendevin_runner import OpenDevinResult

    result = OpenDevinResult()
    result.executor_mode = EXECUTOR_MODE_LEGACY
    result.executor_attempts = ["legacy"]

    if not legacy_executor_enabled():
        result.executor_mode = EXECUTOR_MODE_UNAVAILABLE
        result.error = "Legacy executor is disabled for this environment."
        result.success = False
        return result

    workspace = Path(workspace_path)
    try:
        from agent_runs import (
            apply_change_set,
            build_change_set,
            build_execution_plan,
            build_quality_gates,
            collect_changed_files,
            collect_diff_stat,
            collect_patch,
            collect_repo_context,
            evaluate_run,
            execute_validations,
            self_critique_patch,
        )

        repo_context = collect_repo_context(workspace, issue, context_hints or {})
        plan = build_execution_plan(issue, repo_context)
        result.plan = plan

        change_set = build_change_set(issue, repo_context, plan)
        if change_set.get("blocked"):
            result.error = str(change_set.get("reason") or "Legacy executor blocked by missing context.")
            result.success = False
            return result

        apply_change_set(workspace, change_set)
        patch_text = collect_patch(workspace)
        result.patch = patch_text
        if not patch_text.strip():
            result.error = "Legacy executor completed without producing a patch."
            result.success = False
            return result

        result.diff_stat = collect_diff_stat(workspace)
        result.changed_files = collect_changed_files(workspace)
        validation_report = execute_validations(workspace)
        result.validation = validation_report
        critique_result = self_critique_patch(issue, plan, result.changed_files, patch_text, validation_report)
        result.evaluation = evaluate_run(result.changed_files, validation_report, [])
        result.quality_gates = build_quality_gates(validation_report, result.changed_files, result.evaluation)
        result.success = True
        return result
    except Exception as exc:
        result.error = str(exc)
        result.success = False
        return result


def unavailable_reason(*, availability: dict[str, Any], legacy_error: Optional[str]) -> str:
    channels = availability.get("channels") or []
    channel_text = ", ".join(channels) if channels else "none configured"
    legacy_text = legacy_error or "legacy executor produced no patch"
    return (
        f"OpenDevin is unavailable (channels: {channel_text}). "
        f"Legacy fallback: {legacy_text}."
    )


def classify_proactive_executor_result(result: Any) -> dict[str, Any]:
    patch = (getattr(result, "patch", "") or "").strip()
    mode = getattr(result, "executor_mode", EXECUTOR_MODE_OPENDEVIN) or EXECUTOR_MODE_OPENDEVIN
    error = (getattr(result, "error", "") or "").strip()

    if patch:
        return {
            "has_patch": True,
            "executor_source": mode,
            "failure_kind": None,
            "reason": "",
        }

    if mode == EXECUTOR_MODE_UNAVAILABLE:
        return {
            "has_patch": False,
            "executor_source": "opendevin_unavailable",
            "failure_kind": FAILURE_KIND_EXECUTION_ERROR,
            "reason": error or "OpenDevin and legacy executors were unavailable or produced no patch.",
        }

    if mode == EXECUTOR_MODE_LEGACY:
        return {
            "has_patch": False,
            "executor_source": "legacy",
            "failure_kind": FAILURE_KIND_NO_PATCH,
            "reason": error or "Legacy executor completed without producing a patch.",
        }

    return {
        "has_patch": False,
        "executor_source": "opendevin_reported" if error else "opendevin",
        "failure_kind": FAILURE_KIND_NO_PATCH,
        "reason": error or "OpenDevin execution completed without producing a patch.",
    }
