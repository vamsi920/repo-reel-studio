from __future__ import annotations

import re
import shutil
import json
import os
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Optional

from proactive_candidate_dedupe import BatchDedupeRegistry, load_recent_opportunity_index, register_candidate, select_candidates
from proactive_candidate_score import compute_candidate_score, attach_score_evidence
from proactive_discovery_scan import filter_scannable_source_files, is_scannable_source_file, list_repo_files
from proactive_validation_detect import (
    detect_validation_hints,
    validation_evidence_lines,
)
from proactive_materialize import (
    apply_candidate_materialize_state,
    assert_materialize_consistency,
    build_proactive_run_record,
    sync_materialize_pair,
)
from proactive_store import batch_progress_from_candidates
from proactive_execution_control import (
    guard_proactive_not_cancelled,
    proactive_executor_timeout_seconds,
    run_executor_with_timeout,
    ProactiveExecutionTimeout,
    execution_outcome_for_exception,
)
from proactive_no_patch_failure import (
    FAILURE_KIND_EXECUTION_ERROR,
    FAILURE_KIND_NO_PATCH,
    failure_label,
    persist_run_failure,
)
from proactive_review_ready import (
    assess_review_ready_package,
    build_review_ready_metadata,
)
from agent_runs import (
    RUNS_ROOT,
    CancelledRunError,
    append_timeline,
    now_iso,
    read_run,
    read_text_safe,
    run_dir,
    run_subprocess,
    save_artifacts,
    write_run,
)
from proactive_dispatch import build_dispatch_response, check_dispatch_idempotency
from proactive_store import (
    create_batch,
    dispatch_scope_lock,
    list_candidates,
    get_config,
    transition_batch,
    update_batch,
    update_candidate,
)
from proactive_ai_console import (
    append_ai_console_log as _append_ai_console_log,
    append_candidate_event as _append_candidate_event,
    persist_candidate_event as _persist_candidate_event,
)


def _graphify_centrality_enabled() -> bool:
    return os.getenv("PROACTIVE_GRAPHIFY_CENTRALITY", "").strip().lower() not in ("0", "false", "no", "off")


def _import_counts_for_workspace(workspace: Path, files: list[str]) -> dict[str, int]:
    """build_import_counts(), or real graph-derived centrality when enabled.

    Always falls back to the regex heuristic on any failure -- see
    graphify_centrality.py's module docstring for why (subprocess missing,
    extraction timeout, malformed graph, etc. must never block discovery).
    """
    if _graphify_centrality_enabled():
        try:
            from graphify_centrality import centrality_via_graphify

            return centrality_via_graphify(workspace, files)
        except Exception as exc:  # noqa: BLE001 - graph path is best-effort
            print(f"[proactive] graphify centrality failed, falling back to regex heuristic: {exc}")
    return build_import_counts(workspace, files)


SIGNAL_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX|BUG|OPTIMIZE|PERF)\b[:\-\s]*(.{0,140})", re.I)
TEST_RE = re.compile(r"(\.|/)(test|spec)\.(ts|tsx|js|jsx|py)$|(^|/)tests?/", re.I)
CENTRAL_NAMES = {"app", "index", "main", "server", "router", "api", "store", "client", "agent", "runner"}


def append_candidate_event(
    candidate: dict[str, Any],
    stage: str,
    title: str,
    detail: str = "",
    level: str = "info",
) -> dict[str, Any]:
    return _append_candidate_event(candidate, stage, title, detail, level, now_iso=now_iso)


def persist_candidate_event(
    candidate: dict[str, Any],
    stage: str,
    title: str,
    detail: str = "",
    level: str = "info",
    ai_narrate: bool = False,
) -> dict[str, Any]:
    return _persist_candidate_event(
        candidate,
        stage,
        title,
        detail,
        level,
        ai_narrate=ai_narrate,
        now_iso=now_iso,
        update_candidate_fn=update_candidate,
    )


def append_ai_console_log(
    candidate: dict[str, Any],
    stage: str,
    source_title: str,
    source_detail: str = "",
    level: str = "info",
) -> None:
    _append_ai_console_log(candidate, stage, source_title, source_detail, level, now_iso=now_iso)


def refresh_batch_progress(
    batch: dict[str, Any],
    repo_url: str,
    project_id: Optional[str],
    batch_id: str,
) -> dict[str, Any]:
    candidates = list_candidates(repo_url, project_id, batch_id, include_dismissed=True)
    batch["progress"] = batch_progress_from_candidates(candidates)
    return update_batch(batch)


def dispatch_daily(
    repo_url: str,
    repo_name: Optional[str] = None,
    project_id: Optional[str] = None,
    context_hints: Optional[dict[str, Any]] = None,
    target_count: Optional[int] = None,
    github_token: Optional[str] = None,
) -> dict[str, Any]:
    from proactive_context_hints import normalize_proactive_context_hints

    normalized_hints = normalize_proactive_context_hints(context_hints)
    config = get_config(repo_url, project_id)
    if not config.get("enabled"):
        from proactive_dispatch import build_dispatch_skipped_response

        return build_dispatch_skipped_response(config)

    target = max(1, min(int(target_count or config.get("targetCount") or 6), 6))

    with dispatch_scope_lock(repo_url, project_id):
        workspace_info = prepare_discovery_workspace(repo_url, project_id, github_token)
        env_artifacts = load_available_env_artifacts(project_id)
        early = check_dispatch_idempotency(
            repo_url,
            project_id,
            config,
            target,
            workspace_info.get("headCommit"),
        )
        if early:
            return early

        batch = create_batch(
            repo_url,
            project_id,
            target,
            workspace_info.get("headCommit"),
            repo_name or repo_display_name(repo_url),
        )
        batch["contextHints"] = normalized_hints
        update_batch(batch)
        candidates: list[dict[str, Any]] = []

        try:
            batch = transition_batch(
                batch,
                "discovering",
                "Dispatch started; scanning repository for proactive candidates.",
            )
            batch["metrics"]["shortfallReason"] = "Scanning repository for proactive candidates."
            update_batch(batch)
            discovered = discover_candidates(
                Path(workspace_info["workspacePath"]),
                repo_url,
                project_id,
                batch["id"],
                repo_name or repo_display_name(repo_url),
                normalized_hints,
                env_artifacts,
            )
            for candidate in discovered:
                persist_candidate_event(
                    candidate,
                    "discovered",
                    "Candidate discovered",
                    candidate.get("hypothesis", ""),
                )
            batch = refresh_batch_progress(batch, repo_url, project_id, batch["id"])
            batch = transition_batch(
                batch,
                "scoring",
                f"Scoring {len(discovered)} discovered candidates.",
            )
            batch["metrics"]["shortfallReason"] = f"Scoring {len(discovered)} discovered candidates."
            update_batch(batch)
            selected = select_candidates(discovered, target)
            selected_ids = {item["id"] for item in selected}
            for candidate in discovered:
                if candidate.get("status") == "not_selected" and candidate.get("notSelectedReason"):
                    persist_candidate_event(
                        candidate,
                        "not_selected",
                        "Candidate not selected",
                        candidate["notSelectedReason"],
                        level="warning",
                    )
                    continue
                candidate["status"] = "selected" if candidate["id"] in selected_ids else "not_selected"
                if candidate["status"] == "not_selected":
                    candidate["notSelectedReason"] = (
                        candidate.get("notSelectedReason") or "Below top quality threshold for this batch."
                    )
                    persist_candidate_event(
                        candidate,
                        "not_selected",
                        "Candidate not selected",
                        candidate["notSelectedReason"],
                        level="warning",
                    )
                else:
                    persist_candidate_event(
                        candidate,
                        "selected",
                        "Candidate selected for execution",
                        candidate.get("selectedReason") or "Strong proactive signal selected for sandbox execution.",
                        ai_narrate=True,
                    )
            batch = refresh_batch_progress(batch, repo_url, project_id, batch["id"])
            batch = transition_batch(
                batch,
                "materializing",
                f"Materializing {len(selected)} selected candidates.",
            )
            batch["metrics"]["shortfallReason"] = f"Materializing {len(selected)} selected candidates."
            update_batch(batch)

            materialized = []
            for candidate in selected:
                candidate = materialize_candidate_run(
                    candidate,
                    Path(workspace_info["workspacePath"]),
                    workspace_info.get("headCommit"),
                    env_artifacts,
                    context_hints=normalized_hints,
                )
                materialized.append(update_candidate(candidate))
                batch = refresh_batch_progress(batch, repo_url, project_id, batch["id"])

            ready_count = len([item for item in materialized if item.get("status") == "review_ready"])
            avg = round(sum(item["score"]["total"] for item in selected) / len(selected), 3) if selected else 0
            batch["dispatchCompletedAt"] = now_iso()
            batch["progress"] = {
                "discovered": len(discovered),
                "selected": len(selected),
                "materialized": len(materialized),
                "ready": ready_count,
                "dismissed": 0,
            }
            batch["metrics"] = {
                "qualityMode": config.get("qualityMode", "high"),
                "shortfallReason": None if ready_count >= target else f"{ready_count}/{target} met high-confidence gates.",
                "averageScore": avg,
                "envArtifactsAvailable": bool(env_artifacts),
            }
            batch = transition_batch(
                batch,
                "complete",
                f"Dispatch completed with {ready_count} review-ready candidate(s).",
            )
            candidates = list_candidates(repo_url, project_id, batch["id"], include_dismissed=True)
        except Exception as exc:
            from proactive_secret_sanitizer import sanitize_exception_message

            safe_message = sanitize_exception_message(exc)
            batch["dispatchCompletedAt"] = now_iso()
            batch["metrics"]["shortfallReason"] = safe_message
            transition_batch(batch, "failed", f"Dispatch failed: {safe_message}")
            raise

    return build_dispatch_response(
        "complete",
        config,
        target,
        repo_url,
        project_id,
        batch,
    )


def prepare_discovery_workspace(repo_url: str, project_id: Optional[str], github_token: Optional[str] = None) -> dict[str, Any]:
    from proactive_workspace import DiscoveryWorkspaceError, prepare_discovery_workspace as prepare_workspace

    try:
        return prepare_workspace(repo_url, project_id, github_token)
    except DiscoveryWorkspaceError as exc:
        raise RuntimeError(exc.detail or str(exc)) from exc


def load_available_env_artifacts(project_id: Optional[str]) -> Optional[dict[str, Any]]:
    if not project_id:
        return None
    try:
        from env_builder import load_env_artifacts

        return load_env_artifacts(project_id)
    except Exception:
        return None


def discover_candidates(
    workspace: Path,
    repo_url: str,
    project_id: Optional[str],
    batch_id: str,
    repo_name_value: str,
    context_hints: dict[str, Any],
    env_artifacts: Optional[dict[str, Any]],
) -> list[dict[str, Any]]:
    files = list_repo_files(workspace)
    test_files = {path for path in files if TEST_RE.search(path)}
    validation_profile = detect_validation_hints(workspace, env_artifacts)
    validation = validation_evidence_lines(validation_profile)
    import_counts = _import_counts_for_workspace(workspace, files)
    recent_index = load_recent_opportunity_index(
        repo_url,
        project_id,
        exclude_batch_id=batch_id,
    )
    registry = BatchDedupeRegistry(recent_index)
    from proactive_context_hints import (
        compute_context_hint_bonus,
        context_hint_flags_for_path,
        manifest_evidence_floor,
        normalize_proactive_context_hints,
    )

    normalized_hints = normalize_proactive_context_hints(context_hints, workspace=workspace)

    def hint_bonus_for(path: str) -> float:
        flags = context_hint_flags_for_path(path, normalized_hints)
        return compute_context_hint_bonus(
            in_focus=flags["focus"],
            in_hub=flags["hub"],
            in_entry=flags["entry"],
        )

    add_package_candidates(
        workspace,
        repo_url,
        repo_name_value,
        project_id,
        batch_id,
        validation,
        registry,
        validation_profile=validation_profile,
    )

    for path in files:
        if not is_scannable_source_file(workspace, path):
            continue
        absolute = workspace / path
        content = read_text_safe(absolute, 24000)
        if not content:
            continue

        flags = context_hint_flags_for_path(path, normalized_hints)
        hint_bonus = hint_bonus_for(path)

        for signal, detail in SIGNAL_RE.findall(content):
            evidence = extract_signal_evidence(content, path, signal)
            candidate = build_candidate(
                repo_url,
                repo_name_value,
                project_id,
                batch_id,
                "bug" if signal.upper() in {"FIXME", "BUG"} else "improvement",
                f"Resolve {signal.upper()} in {path}",
                f"{path} contains an explicit {signal.upper()} marker: {detail.strip() or 'needs follow-up'}.",
                evidence + validation,
                path,
                import_counts.get(path, 0),
                has_nearby_test(path, test_files),
                hinted=bool(hint_bonus),
                context_hint_bonus=hint_bonus,
                evidence_count=manifest_evidence_floor(len(evidence), normalized_hints, flags["focus"]),
                validation_hints=validation,
                validation_profile=validation_profile,
            )
            register_candidate(registry, candidate)

        if path_score_name(path) >= 2 and import_counts.get(path, 0) >= 2 and not has_nearby_test(path, test_files):
            candidate = build_candidate(
                repo_url,
                repo_name_value,
                project_id,
                batch_id,
                "improvement",
                f"Add validation coverage around {path}",
                f"{path} is central and lacks an obvious neighboring test/spec file.",
                [
                    f"{path} is imported by {import_counts.get(path, 0)} tracked files.",
                    "No nearby test/spec file detected.",
                    *validation,
                ],
                path,
                import_counts.get(path, 0),
                False,
                hinted=bool(hint_bonus),
                context_hint_bonus=hint_bonus,
                evidence_count=manifest_evidence_floor(3, normalized_hints, flags["focus"]),
                validation_hints=validation,
                validation_profile=validation_profile,
            )
            register_candidate(registry, candidate)

        if re.search(r"\b(useEffect|setInterval|addEventListener|fetch)\b", content) and "cleanup" not in content.lower():
            candidate = build_candidate(
                repo_url,
                repo_name_value,
                project_id,
                batch_id,
                "perf",
                f"Review lifecycle cleanup in {path}",
                f"{path} uses async/lifecycle primitives where missing cleanup can cause leaks or stale work.",
                [
                    f"{path} references lifecycle or async work.",
                    "No explicit cleanup wording found in the scanned file.",
                    *validation,
                ],
                path,
                import_counts.get(path, 0),
                has_nearby_test(path, test_files),
                hinted=bool(hint_bonus),
                context_hint_bonus=hint_bonus,
                evidence_count=manifest_evidence_floor(2, normalized_hints, flags["focus"]),
                validation_hints=validation,
                validation_profile=validation_profile,
            )
            register_candidate(registry, candidate)

    candidates = registry.finalize()
    candidates.sort(key=lambda item: (item["score"]["total"], item["score"]["centrality"], item["title"]), reverse=True)
    return candidates


def materialize_candidate_run(
    candidate: dict[str, Any],
    discovery_workspace: Path,
    repo_head: Optional[str],
    env_artifacts: Optional[dict[str, Any]] = None,
    *,
    context_hints: Optional[dict[str, Any]] = None,
    runner_factory: Optional[Any] = None,
    executor_timeout_seconds: Optional[int] = None,
) -> dict[str, Any]:
    from proactive_synthetic_issue import attach_synthetic_issue_to_run

    run_id = uuid.uuid4().hex
    run = build_proactive_run_record(candidate, run_id, repo_head=repo_head, context_hints=context_hints)
    run = attach_synthetic_issue_to_run(run, candidate)
    write_run(run)
    apply_candidate_materialize_state(candidate, "run_linked", run_id=run_id)
    assert_materialize_consistency(candidate, run)
    persist_candidate_event(
        candidate,
        "preparing",
        "Agent run created",
        f"Linked proactive candidate to Agent Ops run {run_id[:8]}.",
        ai_narrate=True,
    )
    append_timeline(run_id, "created", "Proactive run created", f"Linked candidate {candidate['id'][:8]} to sandbox run.")
    return execute_candidate_run(
        candidate,
        discovery_workspace,
        env_artifacts,
        runner_factory=runner_factory,
        executor_timeout_seconds=executor_timeout_seconds,
    )


def execute_candidate_run(
    candidate: dict[str, Any],
    discovery_workspace: Path,
    env_artifacts: Optional[dict[str, Any]],
    *,
    runner_factory: Optional[Any] = None,
    executor_timeout_seconds: Optional[int] = None,
) -> dict[str, Any]:
    from opendevin_runner import OpenDevinAdapter

    run_id = candidate["runId"]
    timeout_budget = (
        executor_timeout_seconds
        if executor_timeout_seconds is not None
        else proactive_executor_timeout_seconds()
    )
    reason = ""
    workspace: Optional[Path] = None
    try:
        workspace = prepare_candidate_workspace(discovery_workspace, run_id)
        run = read_run(run_id)
        if not run:
            raise RuntimeError("Proactive AgentRun record disappeared before execution")

        _start_candidate_sandbox(run_id, workspace, run)

        from proactive_branch_name import is_proactive_issue

        synthetic_issue = run.get("issue") if is_proactive_issue(run.get("issue")) else build_synthetic_issue(candidate)

        guard_proactive_not_cancelled(run_id)
        run["issue"] = synthetic_issue
        persist_candidate_event(
            candidate,
            "preparing",
            "Workspace prepared",
            "Isolated sandbox workspace prepared from the discovery checkout.",
            ai_narrate=True,
        )
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            "workspace_ready",
            workspace_path=str(workspace),
        )

        persist_candidate_event(
            candidate,
            "patching",
            "Executor started",
            "OpenDevin runner is analyzing the candidate and attempting a minimal patch.",
            ai_narrate=True,
        )
        candidate, run = sync_materialize_pair(candidate, run, "executor_started", workspace_path=str(workspace))

        guard_proactive_not_cancelled(run_id)
        create_runner = runner_factory or OpenDevinAdapter.create_runner
        runner = create_runner(str(workspace), run, env_artifacts)

        def _run_executor() -> Any:
            guard_proactive_not_cancelled(run_id)
            return runner.run(
                issue=synthetic_issue,
                context_hints=run.get("contextHints"),
                env_artifacts=env_artifacts,
            )

        result = run_executor_with_timeout(_run_executor, timeout_seconds=timeout_budget)
        guard_proactive_not_cancelled(run_id)

        persist_candidate_event(
            candidate,
            "validating",
            "Executor finished",
            "Collecting patch and validation artifacts from the linked Agent Ops run.",
            ai_narrate=True,
        )
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            "validating",
            workspace_path=str(workspace),
            timeline=False,
        )

        run = read_run(run_id) or run
        run = OpenDevinAdapter.apply_result_to_run(run, result)
        write_run(run)
        patch = (result.patch or "").strip()
        if patch:
            from proactive_sandbox_policy import enforce_proactive_sandbox_policy, sync_policy_metadata_to_candidate

            run, result_changed_files, policy_violations = enforce_proactive_sandbox_policy(
                run,
                result.changed_files,
                result.validation,
                workspace,
                quality_gates=result.quality_gates or {"gates": []},
                evaluation=result.evaluation,
            )
            result.changed_files = result_changed_files

            run["artifacts"]["workspacePath"] = str(workspace)
            artifact_paths = save_artifacts(
                run_id,
                result.patch,
                result.diff_stat,
                result.validation,
                result.pr_draft or {},
            )
            run["artifacts"]["artifactPaths"] = artifact_paths
            write_run(run)

            sandbox_meta = (run.get("artifacts") or {}).get("sandboxPolicy") or {}
            assessment = assess_review_ready_package(
                patch=patch,
                changed_files=result.changed_files,
                artifact_paths=artifact_paths,
                validation=run.get("artifacts", {}).get("validation"),
                quality_gates=run.get("artifacts", {}).get("qualityGates"),
                policy_violations=policy_violations,
                sensitive_paths=list(sandbox_meta.get("sensitivePaths") or []),
            )
            if not assessment["eligible"]:
                reason = assessment["ineligibleReason"] or "Patch-backed review requirements were not met."
                failure_kind = FAILURE_KIND_EXECUTION_ERROR if assessment["policyBlocked"] else FAILURE_KIND_NO_PATCH
                source = "policy_gate" if assessment["policyBlocked"] else "review_ready_gate"
                persist_run_failure(run, failure_kind=failure_kind, reason=reason, source=source)
                write_run(run)
                candidate, run = sync_materialize_pair(
                    candidate,
                    run,
                    "no_patch" if failure_kind == FAILURE_KIND_NO_PATCH else "execution_error",
                    workspace_path=str(workspace),
                    reason=reason,
                    completed=True,
                )
                candidate = sync_policy_metadata_to_candidate(candidate, run)
                from proactive_policy_visibility import policy_visibility_from_run

                policy_vis = policy_visibility_from_run(run, candidate_metadata=candidate.get("reviewMetadata"))
                return mark_candidate_needs_execution(
                    candidate,
                    reason,
                    failure_kind=failure_kind,
                    executor_source=source,
                    policy_visibility=policy_vis if source == "policy_gate" else None,
                )

            candidate, run = sync_materialize_pair(
                candidate,
                run,
                "review_ready",
                workspace_path=str(workspace),
                completed=True,
            )
            candidate = sync_policy_metadata_to_candidate(candidate, run)
            return mark_candidate_ready(
                candidate,
                workspace,
                result.changed_files,
                assessment=assessment,
            )

        from opendevin_fallback import classify_proactive_executor_result

        outcome = classify_proactive_executor_result(result)
        reason = outcome["reason"]
        source = outcome["executor_source"]
        failure_kind = outcome["failure_kind"] or FAILURE_KIND_NO_PATCH
        run["artifacts"]["workspacePath"] = str(workspace)
        persist_run_failure(run, failure_kind=failure_kind, reason=reason, source=source)
        write_run(run)
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            "execution_error" if failure_kind == FAILURE_KIND_EXECUTION_ERROR else "no_patch",
            workspace_path=str(workspace),
            reason=reason,
            completed=True,
        )
        return mark_candidate_needs_execution(
            candidate,
            reason,
            failure_kind=failure_kind,
            executor_source=source,
        )
    except CancelledRunError:
        return finalize_proactive_execution_stop(
            candidate,
            run_id,
            "cancelled",
            "Linked Agent Ops run was cancelled before execution completed.",
        )
    except ProactiveExecutionTimeout as exc:
        return finalize_proactive_execution_stop(
            candidate,
            run_id,
            "timed_out",
            str(exc) or "Proactive executor timed out.",
        )
    except Exception as exc:
        outcome = execution_outcome_for_exception(exc)
        phase = "cancelled" if outcome == "cancelled" else "timed_out" if outcome == "timeout" else "execution_error"
        return finalize_proactive_execution_stop(
            candidate,
            run_id,
            phase,
            str(exc) or "Proactive execution failed.",
        )
    finally:
        if workspace is not None:
            try:
                from sandbox_runner import destroy_sandbox

                destroy_sandbox(str(workspace))
            except ImportError:
                pass


def _start_candidate_sandbox(run_id: str, workspace: Path, run: dict[str, Any]) -> None:
    """Best-effort: register a real container sandbox for this candidate's workspace.

    Never raises — patch/test execution must proceed via the Local tier if
    Docker isn't available (see sandbox_runner.create_sandbox).
    """
    try:
        from sandbox_runner import create_sandbox, ensure_image_for_workspace

        image_tag = ensure_image_for_workspace(run.get("projectId"), str(workspace), run.get("repoUrl") or "")
        handle = create_sandbox(run_id, str(workspace), image_tag)
        if handle.mode == "docker":
            append_timeline(
                run_id, "workspace", "Sandbox containerized",
                f"Patch/test execution is isolated in a Docker container ({handle.image_tag}).",
            )
        else:
            append_timeline(
                run_id, "workspace", "Sandbox running locally",
                "Docker isolation was unavailable for this run; falling back to a local process sandbox.",
                level="warning",
            )
    except ImportError:
        pass


def finalize_proactive_execution_stop(
    candidate: dict[str, Any],
    run_id: str,
    phase: str,
    reason: str,
) -> dict[str, Any]:
    from proactive_failure_recovery import safe_read_agent_run

    run, _recovery = safe_read_agent_run(run_id)
    workspace_path = None
    if run:
        workspace_path = (run.get("artifacts") or {}).get("workspacePath")
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            phase,
            workspace_path=workspace_path,
            reason=reason,
            completed=True,
        )
    if phase == "execution_error":
        if run:
            persist_run_failure(run, failure_kind=FAILURE_KIND_EXECUTION_ERROR, reason=reason, source="proactive")
            write_run(run)
        return mark_candidate_needs_execution(
            candidate,
            reason,
            failure_kind=FAILURE_KIND_EXECUTION_ERROR,
            executor_source="proactive",
        )
    return mark_candidate_execution_stopped(candidate, reason, phase)


def prepare_candidate_workspace(discovery_workspace: Path, run_id: str) -> Path:
    workspace = run_dir(run_id) / "workspace"
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(
        discovery_workspace,
        workspace,
        symlinks=True,
        ignore=shutil.ignore_patterns("node_modules", "dist", "build", "coverage", ".next"),
    )
    ensure_git_baseline(workspace)
    return workspace


def ensure_git_baseline(workspace: Path) -> None:
    if (workspace / ".git").exists():
        return
    init = run_subprocess(["git", "init"], cwd=str(workspace), timeout_seconds=20)
    if init["exitCode"] != 0:
        raise RuntimeError(init["stderr"] or init["stdout"] or "git init failed for proactive workspace")
    add = run_subprocess(["git", "add", "-A"], cwd=str(workspace), timeout_seconds=60)
    if add["exitCode"] != 0:
        raise RuntimeError(add["stderr"] or add["stdout"] or "git add failed for proactive workspace")
    commit = run_subprocess(
        [
            "git",
            "-c",
            "user.name=GitFlick Proactive",
            "-c",
            "user.email=proactive@gitflick.local",
            "commit",
            "-m",
            "Baseline proactive workspace",
        ],
        cwd=str(workspace),
        timeout_seconds=60,
    )
    if commit["exitCode"] != 0 and "nothing to commit" not in (commit["stdout"] + commit["stderr"]).lower():
        raise RuntimeError(commit["stderr"] or commit["stdout"] or "git baseline commit failed for proactive workspace")


def build_synthetic_issue(candidate: dict[str, Any]) -> dict[str, Any]:
    from proactive_synthetic_issue import build_synthetic_issue as _build_synthetic_issue

    return _build_synthetic_issue(candidate)


def mark_candidate_ready(
    candidate: dict[str, Any],
    workspace: Path,
    changed_files: list[dict[str, Any]],
    *,
    assessment: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    apply_candidate_materialize_state(candidate, "review_ready")
    candidate.setdefault("reviewMetadata", {}).update(
        build_review_ready_metadata(
            assessment or {},
            workspace_path=str(workspace),
            changed_files=changed_files,
        )
    )
    candidate.setdefault("qualityGates", {})["needsPatch"] = False
    coverage = (assessment or {}).get("validationCoverage") or "missing"
    summary = (assessment or {}).get("validationSummary") or ""
    file_count = (assessment or {}).get("changedFileCount") or len(changed_files)
    detail = (
        f"{file_count} changed file(s) ready for human review. "
        f"Validation coverage: {coverage}."
    )
    if summary:
        detail = f"{detail} {summary}"
    append_candidate_event(
        candidate,
        "review_ready",
        "Patch-backed review ready",
        detail.strip(),
    )
    append_ai_console_log(
        candidate,
        "review_ready",
        "Patch-backed review ready",
        detail.strip(),
    )
    return update_candidate(candidate)


def mark_candidate_execution_stopped(
    candidate: dict[str, Any],
    reason: str,
    phase: str,
) -> dict[str, Any]:
    if phase not in {"cancelled", "timed_out"}:
        return mark_candidate_needs_execution(
            candidate,
            reason,
            failure_kind=FAILURE_KIND_EXECUTION_ERROR if phase == "execution_error" else FAILURE_KIND_NO_PATCH,
        )

    if candidate.get("status") != "needs_execution":
        apply_candidate_materialize_state(candidate, phase)

    dismissed_equivalent = phase == "cancelled"
    candidate.setdefault("reviewMetadata", {}).update(
        {
            "internalOnly": True,
            "autoOpenPr": False,
            "requiresPatchExecutor": True,
            "patchBacked": False,
            "prApprovalBlocked": True,
            "executionOutcome": phase,
            "executionReason": reason,
            "dismissedEquivalent": dismissed_equivalent,
        }
    )
    title = "Run cancelled" if phase == "cancelled" else "Executor timed out"
    append_candidate_event(
        candidate,
        phase,
        title,
        reason,
        level="warning",
    )
    append_ai_console_log(candidate, "needs_execution", title, reason, level="warning")
    return update_candidate(candidate)


def mark_candidate_needs_execution(
    candidate: dict[str, Any],
    reason: str,
    *,
    failure_kind: str = FAILURE_KIND_NO_PATCH,
    executor_source: Optional[str] = None,
    policy_visibility: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    from proactive_no_patch_failure import build_candidate_failure_metadata

    kind = failure_kind if failure_kind in {FAILURE_KIND_NO_PATCH, FAILURE_KIND_EXECUTION_ERROR} else FAILURE_KIND_NO_PATCH
    phase = "execution_error" if kind == FAILURE_KIND_EXECUTION_ERROR else "no_patch"
    if candidate.get("status") != "needs_execution":
        apply_candidate_materialize_state(candidate, phase)

    candidate.setdefault("reviewMetadata", {}).update(
        build_candidate_failure_metadata(
            failure_kind=kind,
            reason=reason,
            source=executor_source,
            policy_visibility=policy_visibility,
        )
    )
    title = failure_label(kind)
    append_candidate_event(
        candidate,
        "needs_execution",
        title,
        reason,
        level="error" if kind == FAILURE_KIND_EXECUTION_ERROR else "warning",
    )
    append_ai_console_log(candidate, "needs_execution", title, reason, level="warning")
    return update_candidate(candidate)


def build_candidate(
    repo_url: str,
    repo_name_value: str,
    project_id: Optional[str],
    batch_id: str,
    kind: str,
    title: str,
    hypothesis: str,
    evidence: list[str],
    path: str,
    centrality: int,
    has_test: bool,
    hinted: bool = False,
    context_hint_bonus: Optional[float] = None,
    evidence_count: Optional[int] = None,
    validation_hints: Optional[list[str]] = None,
    validation_profile: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    raw_evidence = [str(item).strip() for item in evidence if str(item).strip()]
    score = compute_candidate_score(
        path=path,
        evidence_count=evidence_count if evidence_count is not None else len(raw_evidence),
        centrality=centrality,
        has_nearby_test=has_test,
        context_hinted=hinted,
        context_hint_bonus=context_hint_bonus,
        validation_hints=validation_hints,
        validation_profile=validation_profile,
    )
    created = now_iso()
    return {
        "id": uuid.uuid4().hex,
        "batchId": batch_id,
        "repoUrl": repo_url,
        "repoName": repo_name_value,
        "projectId": project_id,
        "status": "discovered",
        "type": kind,
        "title": title[:140],
        "hypothesis": hypothesis,
        "evidence": attach_score_evidence(raw_evidence, score),
        "validationProfile": validation_profile,
        "score": {
            "signal": score["signal"],
            "validation": score["validation"],
            "centrality": score["centrality"],
            "risk": score["risk"],
            "riskLabel": score["riskLabel"],
            "total": score["total"],
        },
        "dedupeKey": f"{path}:{kind}",
        "selectedReason": None,
        "notSelectedReason": None,
        "runId": None,
        "qualityGates": {
            "needsPatch": True,
            "needsValidation": True,
            "needsHumanApproval": True,
            "autoOpenPr": False,
        },
        "stage": "observed",
        "timeline": [
            {"at": created, "stage": "observed", "title": "Static signal found"},
            {"at": created, "stage": "investigating", "title": "Ranked for review"},
        ],
        "reviewReady": False,
        "reviewMetadata": {
            "internalOnly": True,
            "autoOpenPr": False,
            "requiresPatchExecutor": True,
        },
        "createdAt": created,
        "updatedAt": created,
    }


def add_package_candidates(
    workspace: Path,
    repo_url: str,
    repo_name_value: str,
    project_id: Optional[str],
    batch_id: str,
    validation: list[str],
    registry: BatchDedupeRegistry,
    validation_profile: Optional[dict[str, Any]] = None,
) -> None:
    package_path = workspace / "package.json"
    if not package_path.exists():
        return
    try:
        import json

        package = json.loads(package_path.read_text(encoding="utf-8"))
    except Exception:
        return
    scripts = package.get("scripts") or {}
    if "test" not in scripts:
        register_candidate(
            registry,
            build_candidate(
                repo_url,
                repo_name_value,
                project_id,
                batch_id,
                "reliability",
                "Add a package test script",
                "package.json has no test script, so routine validation is harder to run before review.",
                ["package.json lacks a test script.", *validation],
                "package.json",
                3,
                False,
                validation_hints=validation,
                validation_profile=validation_profile,
            ),
        )
    if "lint" not in scripts and any(path.exists() for path in (workspace / "eslint.config.js", workspace / ".eslintrc")):
        register_candidate(
            registry,
            build_candidate(
                repo_url,
                repo_name_value,
                project_id,
                batch_id,
                "reliability",
                "Expose lint validation in package scripts",
                "Lint config exists but package.json has no lint script for reviewers or automation.",
                ["Lint config detected.", "package.json lacks a lint script.", *validation],
                "package.json",
                3,
                False,
                validation_hints=validation,
                validation_profile=validation_profile,
            ),
        )


def build_import_counts(workspace: Path, files: list[str]) -> dict[str, int]:
    counts = {path: 0 for path in files}
    stems = {Path(path).stem: path for path in files}
    scannable = filter_scannable_source_files(workspace, files[:1200])
    for path in scannable:
        absolute = workspace / path
        content = read_text_safe(absolute, 16000)
        for stem, target in stems.items():
            if target == path or len(stem) < 4:
                continue
            if re.search(rf"[/\"']{re.escape(stem)}(?:\.[a-z]+)?[\"']", content):
                counts[target] = counts.get(target, 0) + 1
    return counts


def extract_signal_evidence(content: str, path: str, signal: str) -> list[str]:
    evidence = []
    for i, line in enumerate(content.splitlines(), 1):
        if signal.lower() in line.lower():
            evidence.append(f"{path}:{i} {line.strip()[:180]}")
        if len(evidence) >= 3:
            break
    return evidence or [f"{path} contains {signal.upper()} marker."]


def has_nearby_test(path: str, test_files: set[str]) -> bool:
    p = Path(path)
    stem = p.stem.lower()
    parent = str(p.parent).lower()
    return any(stem in Path(test).stem.lower() or str(Path(test).parent).lower() == parent for test in test_files)


def path_score_name(path: str) -> int:
    p = Path(path)
    score = 0
    if p.stem.lower() in CENTRAL_NAMES:
        score += 2
    if len(p.parts) <= 3:
        score += 1
    if "src" in p.parts or "server" in p.parts:
        score += 1
    return score


def repo_name(repo_url: str) -> str:
    return repo_url.rstrip("/").split("/")[-1].replace(".git", "") or "repository"


def repo_display_name(repo_url: str) -> str:
    return repo_name(repo_url)
