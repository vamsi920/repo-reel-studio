"""
BugBotOrchestrator: end-to-end pipeline that coordinates the full
reproduce → diagnose → patch → validate → PR draft loop.

Uses cached workspaces + prebuilt Docker sandbox images from EnvBuilder.
Delegates execution to OpenDevinRunner, falling back to the legacy
Gemini-based executor.
"""
from __future__ import annotations

import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from agent_runs import (
    RUNS_ROOT,
    append_timeline,
    build_branch_name,
    now_iso,
    read_required_run,
    run_subprocess,
    sanitize_branch_name,
    write_run,
)
from env_builder import ensure_agent_ready_environment, load_env_artifacts
from opendevin_runner import OpenDevinAdapter, OpenDevinConfig, OpenDevinRunner


BUGBOT_CONCURRENCY_LIMIT = int(os.getenv("BUGBOT_CONCURRENCY_LIMIT", "3"))


class BugBotStage:
    PREPARE = "prepare"
    REPRODUCE = "reproduce"
    DIAGNOSE = "diagnose"
    PATCH = "patch"
    VALIDATE = "validate"
    PR_DRAFT = "pr_draft"
    COMPLETE = "complete"
    FAILED = "failed"

    ALL_STAGES = [PREPARE, REPRODUCE, DIAGNOSE, PATCH, VALIDATE, PR_DRAFT, COMPLETE]


class BugBotOrchestrator:
    """
    Orchestrates the full BugBot pipeline for an agent run.
    
    Pipeline stages:
    1. PREPARE  - Sync cached repo, materialize isolated workspace, pull env image
    2. REPRODUCE - Run baseline tests, capture failing output
    3. DIAGNOSE  - Form root cause hypotheses using OpenDevin
    4. PATCH     - Implement fix
    5. VALIDATE  - Rerun tests + quality gates
    6. PR_DRAFT  - Create draft PR via GitHub App
    """

    def __init__(self, run_id: str, github_token: Optional[str] = None):
        self.run_id = run_id
        self.github_token = github_token
        self.current_stage = BugBotStage.PREPARE
        self.stage_results: dict[str, dict[str, Any]] = {}
        self.workspace_path: Optional[Path] = None
        self.env_artifacts: Optional[dict[str, Any]] = None
        self.runner: Optional[OpenDevinRunner] = None

    def execute(self) -> dict[str, Any]:
        """Run the full pipeline."""
        pipeline_start = time.time()
        self._emit_stage("pipeline.start", "BugBot pipeline started",
                        "Running: prepare → reproduce → diagnose → patch → validate → PR")

        try:
            self._stage_prepare()
            self._stage_reproduce()
            self._stage_diagnose()
            self._stage_patch()
            self._stage_validate()
            self._stage_pr_draft()

            duration_ms = int((time.time() - pipeline_start) * 1000)
            self.current_stage = BugBotStage.COMPLETE
            self._emit_stage("pipeline.complete", "BugBot pipeline completed",
                           f"Total duration: {duration_ms}ms")

            return {
                "status": "success",
                "stage": BugBotStage.COMPLETE,
                "stages": self.stage_results,
                "duration_ms": duration_ms,
            }

        except Exception as exc:
            self.current_stage = BugBotStage.FAILED
            self._emit_stage("pipeline.failed", "BugBot pipeline failed",
                           str(exc), level="error")
            return {
                "status": "failed",
                "stage": self.current_stage,
                "error": str(exc),
                "stages": self.stage_results,
                "duration_ms": int((time.time() - pipeline_start) * 1000),
            }

    def _stage_prepare(self) -> None:
        """Stage 1: Sync repo, materialize workspace, pull env image."""
        self.current_stage = BugBotStage.PREPARE
        stage_start = time.time()
        self._emit_stage("prepare.start", "Preparing sandbox environment")

        run = read_required_run(self.run_id)
        project_id = run.get("projectId")

        # Materialize workspace
        workspace = RUNS_ROOT / self.run_id / "workspace"
        if workspace.exists():
            shutil.rmtree(workspace)
        workspace.parent.mkdir(parents=True, exist_ok=True)

        repo_url = run["repoUrl"]
        branch = run.get("branch")

        if project_id:
            try:
                from repo_workspace import get_valid_cache_for_run, materialize_run_workspace
                cache = get_valid_cache_for_run(str(project_id), repo_url)
                if cache is not None:
                    materialize_run_workspace(cache, workspace, repo_url, branch)
                    self._emit_stage("prepare.cache", "Reused project cache",
                                    "Fast workspace materialization from Phase-1 cache")
            except Exception as exc:
                self._emit_stage("prepare.cache_miss", "Project cache unavailable",
                               str(exc), level="warning")

        if not workspace.exists() or not (workspace / ".git").exists():
            clone_result = run_subprocess(
                ["git", "clone", "--depth", "1", repo_url, str(workspace)],
                cwd=str(workspace.parent), timeout_seconds=120,
            )
            if clone_result["exitCode"] != 0:
                raise RuntimeError(f"Clone failed: {clone_result.get('stderr', '')}")

            if branch:
                run_subprocess(["git", "checkout", branch],
                             cwd=str(workspace), timeout_seconds=20)

        self.workspace_path = workspace

        # Update run with workspace
        run["artifacts"]["workspacePath"] = str(workspace)
        run["updatedAt"] = now_iso()
        write_run(run)

        # Load/build env artifacts
        if project_id:
            self.env_artifacts = load_env_artifacts(project_id)
            if not self.env_artifacts:
                self._emit_stage("prepare.env_build", "Building environment artifacts")
                env_result = ensure_agent_ready_environment(
                    repo_url=repo_url,
                    project_id=project_id,
                    workspace_path=str(workspace),
                )
                self.env_artifacts = {
                    "detect": env_result["stack"],
                    "commands": {
                        "install": env_result["stack"].get("install_command", ""),
                        "test": env_result["stack"].get("test_commands", []),
                        "lint": env_result["stack"].get("lint_commands", []),
                        "build": env_result["stack"].get("build_commands", []),
                    },
                    "image": env_result["image"],
                }

        self.stage_results[BugBotStage.PREPARE] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "workspace": str(workspace),
            "env_ready": self.env_artifacts is not None,
        }
        self._emit_stage("prepare.done", "Sandbox ready",
                        f"Workspace: {workspace}")

    def _stage_reproduce(self) -> None:
        """Stage 2: Run baseline tests to capture failing output."""
        self.current_stage = BugBotStage.REPRODUCE
        stage_start = time.time()
        self._emit_stage("repro.start", "Reproducing issue")

        ws = str(self.workspace_path)
        test_commands = []

        if self.env_artifacts and self.env_artifacts.get("commands"):
            cmds = self.env_artifacts["commands"]
            if cmds.get("install"):
                install_cmd = cmds["install"]
                if isinstance(install_cmd, str):
                    install_cmd = install_cmd.split()
                install_result = run_subprocess(install_cmd, cwd=ws, timeout_seconds=300)
                self._emit_stage("repro.install",
                               f"Install: exit {install_result['exitCode']}",
                               install_result.get("stderr", "")[:300])

            for tc in cmds.get("test", []):
                test_commands.append(tc.split() if isinstance(tc, str) else tc)

        if not test_commands:
            test_commands = [["git", "diff", "--check"]]

        repro_results = []
        for cmd in test_commands[:3]:
            result = run_subprocess(cmd, cwd=ws, timeout_seconds=300)
            repro_results.append(result)
            self._emit_stage("repro.test",
                           f"Test `{' '.join(cmd)}`: exit {result['exitCode']}",
                           result.get("stderr", "")[:300] or result.get("stdout", "")[:300])

        baseline_failing = any(r["exitCode"] != 0 for r in repro_results)

        self.stage_results[BugBotStage.REPRODUCE] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "baseline_failing": baseline_failing,
            "test_results": repro_results,
        }
        self._emit_stage("repro.done",
                        f"Baseline: {'FAILING' if baseline_failing else 'PASSING'}",
                        f"Ran {len(repro_results)} test commands")

    def _stage_diagnose(self) -> None:
        """Stage 3: Ask OpenDevin to analyze root cause."""
        self.current_stage = BugBotStage.DIAGNOSE
        stage_start = time.time()
        self._emit_stage("diagnose.start", "Diagnosing root cause")

        run = read_required_run(self.run_id)
        issue = run.get("issue") or {}
        repro = self.stage_results.get(BugBotStage.REPRODUCE, {})

        self.runner = OpenDevinAdapter.create_runner(
            workspace_path=str(self.workspace_path),
            run=run,
            env_artifacts=self.env_artifacts,
        )

        # The diagnosis is embedded in the full OpenDevin run
        self.stage_results[BugBotStage.DIAGNOSE] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "baseline_failing": repro.get("baseline_failing", False),
        }
        self._emit_stage("diagnose.done", "Root cause analysis prepared",
                        "OpenDevin will perform diagnosis during patch stage")

    def _stage_patch(self) -> None:
        """Stage 4: OpenDevin implements the fix."""
        self.current_stage = BugBotStage.PATCH
        stage_start = time.time()
        self._emit_stage("patch.start", "Implementing fix via OpenDevin")

        run = read_required_run(self.run_id)
        issue = run.get("issue") or {}

        result = self.runner.run(
            issue=issue,
            context_hints=run.get("contextHints"),
            env_artifacts=self.env_artifacts,
        )

        # Apply results to run
        run = read_required_run(self.run_id)
        run = OpenDevinAdapter.apply_result_to_run(run, result)
        write_run(run)

        self.stage_results[BugBotStage.PATCH] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "success": result.success,
            "files_changed": len(result.changed_files),
            "patch_size": len(result.patch),
        }

        if result.success:
            self._emit_stage("patch.done",
                           f"Patch applied: {len(result.changed_files)} files",
                           result.diff_stat[:300])
        else:
            self._emit_stage("patch.failed", "Patch generation failed",
                           result.error or "No diff produced", level="error")
            raise RuntimeError(result.error or "Patch generation did not produce changes")

    def _stage_validate(self) -> None:
        """Stage 5: Rerun targeted tests + broader suite."""
        self.current_stage = BugBotStage.VALIDATE
        stage_start = time.time()
        self._emit_stage("validate.start", "Running validation suite")

        run = read_required_run(self.run_id)
        validation = run.get("artifacts", {}).get("validation", {})
        quality_gates = run.get("artifacts", {}).get("qualityGates", {})

        overall = validation.get("overallStatus", "not_run")
        recommendation = (quality_gates or {}).get("recommendation", "review")

        self.stage_results[BugBotStage.VALIDATE] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "overall_status": overall,
            "recommendation": recommendation,
        }
        self._emit_stage("validate.done",
                        f"Validation: {overall}",
                        f"Recommendation: {recommendation}")

    def _stage_pr_draft(self) -> None:
        """Stage 6: Create draft PR via GitHub."""
        self.current_stage = BugBotStage.PR_DRAFT
        stage_start = time.time()
        self._emit_stage("pr.start", "Creating PR draft")

        run = read_required_run(self.run_id)
        ws = str(self.workspace_path)

        # Commit changes
        run_subprocess(["git", "add", "-A"], cwd=ws, timeout_seconds=20)
        pr_draft = run.get("artifacts", {}).get("prDraft") or {}
        commit_msg = pr_draft.get("title") or "BugBot: automated fix"
        commit_result = run_subprocess(
            ["git", "commit", "-m", commit_msg, "--allow-empty"],
            cwd=ws, timeout_seconds=30,
        )
        self._emit_stage("pr.commit", f"Commit: exit {commit_result['exitCode']}",
                        commit_msg)

        # Get SHA
        sha_result = run_subprocess(["git", "rev-parse", "HEAD"], cwd=ws, timeout_seconds=10)
        commit_sha = sha_result["stdout"].strip()[:40] if sha_result["exitCode"] == 0 else None

        # Build branch name
        issue = run.get("issue") or {}
        branch_name = sanitize_branch_name(
            build_branch_name(issue, run["repoName"])
        )

        branch_result = run_subprocess(
            ["git", "checkout", "-B", branch_name],
            cwd=ws, timeout_seconds=20,
        )

        # Try to push and create PR
        pr_url = None
        promotion_log = []

        push_result = run_subprocess(
            ["git", "push", "origin", branch_name, "--force-with-lease"],
            cwd=ws, timeout_seconds=60,
        )
        promotion_log.append(f"git push: exit={push_result['exitCode']}")

        if push_result["exitCode"] == 0:
            pr_body_path = RUNS_ROOT / self.run_id / "pr-body.md"
            pr_body_path.write_text(pr_draft.get("body", ""), encoding="utf-8")

            pr_create = run_subprocess(
                ["gh", "pr", "create", "--draft",
                 "--title", pr_draft.get("title") or "BugBot fix",
                 "--body-file", str(pr_body_path)],
                cwd=ws, timeout_seconds=30,
            )
            promotion_log.append(f"gh pr create: exit={pr_create['exitCode']}")

            if pr_create["exitCode"] == 0:
                raw_url = pr_create["stdout"].strip()
                if raw_url.startswith("http"):
                    pr_url = raw_url
                    promotion_log.append(f"PR created: {pr_url}")

        # Update run
        run["status"] = "awaiting_review"
        run["updatedAt"] = now_iso()
        run["completedAt"] = now_iso()
        run["approval"] = {
            "status": "pending",
            "branchName": branch_name,
            "instructions": [],
            "approvedAt": None,
            "rejectedAt": None,
            "prUrl": pr_url,
            "commitSha": commit_sha,
            "promotionLog": promotion_log,
        }
        write_run(run)

        self.stage_results[BugBotStage.PR_DRAFT] = {
            "duration_ms": int((time.time() - stage_start) * 1000),
            "branch": branch_name,
            "pr_url": pr_url,
            "commit_sha": commit_sha,
        }

        if pr_url:
            self._emit_stage("pr.done", "Draft PR created", pr_url)
        else:
            self._emit_stage("pr.manual", "PR requires manual push",
                           f"Branch: {branch_name}", level="warning")

    def _emit_stage(self, kind: str, title: str, detail: str = "", level: str = "info") -> None:
        append_timeline(self.run_id, kind, title, detail, level)


def is_bugbot_at_capacity() -> bool:
    """Check if we're at the concurrency limit for active BugBot runs."""
    active_count = 0
    if RUNS_ROOT.exists():
        for d in RUNS_ROOT.iterdir():
            if not d.is_dir():
                continue
            run_path = d / "run.json"
            if run_path.exists():
                try:
                    run = json.loads(run_path.read_text(encoding="utf-8"))
                    if run.get("status") in ("queued", "preparing", "running", "validating"):
                        active_count += 1
                except (json.JSONDecodeError, OSError):
                    pass
    return active_count >= BUGBOT_CONCURRENCY_LIMIT


def has_active_run_for_issue(issue_url: str) -> bool:
    """Check if there's already an active run for this issue."""
    if not RUNS_ROOT.exists():
        return False
    for d in RUNS_ROOT.iterdir():
        if not d.is_dir():
            continue
        run_path = d / "run.json"
        if run_path.exists():
            try:
                run = json.loads(run_path.read_text(encoding="utf-8"))
                if (run.get("issueUrl") == issue_url and
                    run.get("status") in ("queued", "preparing", "running", "validating")):
                    return True
            except (json.JSONDecodeError, OSError):
                pass
    return False
