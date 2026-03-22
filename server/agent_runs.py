from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path, PurePosixPath
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"
STORE_LOCK = threading.Lock()

RUN_STATES = {
    "queued",
    "preparing",
    "running",
    "validating",
    "awaiting_review",
    "approved",
    "rejected",
    "failed",
    "expired",
    "cancelled",
}

WRITE_DENY_PATTERNS = [
    re.compile(r"(^|/)\.git(/|$)"),
    re.compile(r"(^|/)\.env($|\.)"),
    re.compile(r"(^|/)node_modules(/|$)"),
    re.compile(r"(^|/)(dist|build|coverage)(/|$)"),
    re.compile(r"\.(pem|key|crt)$", re.I),
]

SENSITIVE_PATH_PATTERNS = [
    re.compile(r"(^|/)(auth|session|login|permission|access)(/|\.|$)", re.I),
    re.compile(r"(^|/)(db|database|schema|migration|seed)(/|\.|$)", re.I),
    re.compile(r"(^|/)(security|secret|token|credential)(/|\.|$)", re.I),
    re.compile(r"(^|/)\.github(/|$)", re.I),
    re.compile(r"(^|/)(infra|deploy|docker|terraform|k8s|helm)(/|\.|$)", re.I),
]

SOURCE_EXTENSIONS = {
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".py",
    ".go",
    ".rs",
    ".rb",
    ".php",
    ".java",
    ".json",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".md",
    ".mdx",
    ".sql",
    ".sh",
    ".yaml",
    ".yml",
    ".toml",
    ".vue",
    ".svelte",
}

STOP_WORDS = {
    "issue",
    "repo",
    "repository",
    "project",
    "error",
    "fails",
    "failed",
    "failure",
    "with",
    "from",
    "that",
    "this",
    "should",
    "would",
    "could",
    "about",
    "into",
    "after",
    "before",
}

IMPORT_SPECIFIER_RE = re.compile(
    r"""(?:import|export)\s+[\s\S]*?\sfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|require\(\s*["']([^"']+)["']\s*\)""",
    re.MULTILINE,
)


class CancelledRunError(Exception):
    pass


class AgentRunContextHints(BaseModel):
    focusFiles: list[str] = Field(default_factory=list)
    hubFiles: list[str] = Field(default_factory=list)
    entryFiles: list[str] = Field(default_factory=list)
    technologies: list[str] = Field(default_factory=list)
    architecture: Optional[str] = None
    evidenceCount: Optional[int] = None
    snippetCount: Optional[int] = None


class AgentRunCreateRequest(BaseModel):
    repoUrl: str
    repoName: str
    issueUrl: str
    projectId: Optional[str] = None
    branch: Optional[str] = None
    githubToken: Optional[str] = None
    contextHints: Optional[AgentRunContextHints] = None


class AgentRunDecisionRequest(BaseModel):
    branchName: Optional[str] = None


def create_agent_run_router() -> APIRouter:
    router = APIRouter()

    @router.get("/agent-runs")
    def list_agent_runs(
        repoUrl: Optional[str] = None,
        projectId: Optional[str] = None,
        limit: int = 20,
    ):
        return {"runs": list_runs(repo_url=repoUrl, project_id=projectId, limit=limit)}

    @router.post("/agent-runs")
    def create_agent_run(request: AgentRunCreateRequest):
        repo_url = request.repoUrl.strip()
        issue_url = request.issueUrl.strip()
        if not repo_url:
            raise HTTPException(status_code=400, detail="repoUrl is required")
        if repo_url.startswith("local://"):
            raise HTTPException(status_code=400, detail="GitHub-backed repositories are required for agent runs")
        if not issue_url:
            raise HTTPException(status_code=400, detail="issueUrl is required")
        if not re.match(r"^https://github\.com/[^/]+/[^/]+/issues/\d+", issue_url):
            raise HTTPException(status_code=400, detail="Only GitHub issue URLs are supported in v1")

        run_id = uuid.uuid4().hex
        created_at = now_iso()
        run = {
            "id": run_id,
            "status": "queued",
            "createdAt": created_at,
            "updatedAt": created_at,
            "startedAt": None,
            "completedAt": None,
            "projectId": request.projectId,
            "repoUrl": repo_url,
            "repoName": request.repoName.strip() or repo_url,
            "issueUrl": issue_url,
            "branch": request.branch,
            "issue": None,
            "contextHints": request.contextHints.model_dump() if request.contextHints else None,
            "plan": None,
            "timeline": [],
            "policy": {
                "commandAllowlist": [
                    "git clone",
                    "git checkout",
                    "npm install",
                    "npm test",
                    "npm run lint",
                    "npm run build",
                    "python -m pytest",
                    "git diff --check",
                ],
                "pathDenylist": [
                    ".git/**",
                    ".env*",
                    "node_modules/**",
                    "dist/**",
                    "build/**",
                    "coverage/**",
                    "*.pem",
                    "*.key",
                    "*.crt",
                ],
                "networkPolicy": "default-open for clone/install, restricted to runner-managed commands",
            },
            "control": {
                "cancelRequested": False,
            },
            "artifacts": {
                "workspacePath": None,
                "patch": "",
                "diffStat": "",
                "changedFiles": [],
                "validation": {
                    "overallStatus": "not_run",
                    "commands": [],
                },
                "prDraft": None,
                "prReadable": None,
                "testMatrix": None,
                "qualityGates": None,
                "changeIntent": None,
                "artifactPaths": {},
                "failureCategory": None,
            },
            "evaluation": {
                "riskLevel": "medium",
                "riskScore": 0.5,
                "riskReasons": [],
                "confidenceLevel": "low",
                "confidenceScore": 0.2,
                "confidenceReasons": [],
            },
            "metrics": None,
            "approval": {
                "status": "pending",
                "branchName": build_branch_name(None, request.repoName),
                "instructions": [],
                "approvedAt": None,
                "rejectedAt": None,
                "prUrl": None,
                "commitSha": None,
                "promotionLog": [],
            },
        }

        write_run(run)
        append_timeline(run_id, "queued", "Run queued", "Sandbox slot reserved and waiting to start.")

        threading.Thread(
            target=execute_agent_run,
            args=(run_id, request.githubToken),
            daemon=True,
            name=f"agent-run-{run_id[:8]}",
        ).start()
        return {"run": read_required_run(run_id)}

    @router.get("/agent-runs/{run_id}")
    def get_agent_run(run_id: str):
        return {"run": read_required_run(run_id)}

    @router.post("/agent-runs/{run_id}/cancel")
    def cancel_agent_run(run_id: str):
        run = read_required_run(run_id)
        if run["status"] in {"approved", "rejected", "failed", "cancelled"}:
            raise HTTPException(status_code=400, detail="Run is already finalized")
        run["control"]["cancelRequested"] = True
        run["updatedAt"] = now_iso()
        write_run(run)
        append_timeline(run_id, "cancel", "Cancellation requested", "The runner will stop at the next safe checkpoint.")
        return {"run": read_required_run(run_id)}

    @router.post("/agent-runs/{run_id}/approve")
    def approve_agent_run(run_id: str, request: AgentRunDecisionRequest):
        run = read_required_run(run_id)
        if run["status"] not in {"awaiting_review", "approved"}:
            raise HTTPException(status_code=400, detail="Run is not awaiting review")

        workspace_path = run["artifacts"].get("workspacePath")
        if not workspace_path:
            raise HTTPException(status_code=400, detail="No sandbox workspace is available")

        policy_violations = run.get("policyViolations") or []
        if policy_violations:
            append_timeline(run_id, "policy_warning", "Approving despite policy violations", "; ".join(policy_violations), level="warning")

        branch_name = sanitize_branch_name(
            request.branchName
            or run["approval"].get("branchName")
            or build_branch_name(run.get("issue"), run["repoName"])
        )
        promotion_log = []

        branch_result = run_subprocess(
            ["git", "checkout", "-B", branch_name],
            cwd=workspace_path,
            timeout_seconds=20,
        )
        promotion_log.append(f"git checkout -B {branch_name}: exit={branch_result['exitCode']}")
        if branch_result["exitCode"] != 0:
            raise HTTPException(status_code=500, detail=branch_result["stderr"] or branch_result["stdout"] or "Failed to prepare branch")

        pr_draft = run["artifacts"].get("prDraft") or {}
        pr_body = pr_draft.get("body", "")
        pr_body_path = run_dir(run_id) / "pr-body.md"
        pr_body_path.write_text(pr_body, encoding="utf-8")

        pr_url = None
        commit_sha = None

        sha_result = run_subprocess(["git", "rev-parse", "HEAD"], cwd=workspace_path, timeout_seconds=10)
        if sha_result["exitCode"] == 0:
            commit_sha = sha_result["stdout"].strip()[:40]

        push_result = run_subprocess(
            ["git", "push", "origin", branch_name, "--force-with-lease"],
            cwd=workspace_path,
            timeout_seconds=60,
        )
        promotion_log.append(f"git push origin {branch_name}: exit={push_result['exitCode']}")

        if push_result["exitCode"] == 0:
            pr_title = shell_quote(pr_draft.get("title") or "GitFlick agent run")
            pr_create_result = run_subprocess(
                ["gh", "pr", "create", "--title", pr_draft.get("title") or "GitFlick agent run", "--body-file", str(pr_body_path)],
                cwd=workspace_path,
                timeout_seconds=30,
            )
            promotion_log.append(f"gh pr create: exit={pr_create_result['exitCode']}")

            if pr_create_result["exitCode"] == 0:
                raw_url = pr_create_result["stdout"].strip()
                if raw_url.startswith("http"):
                    pr_url = raw_url
                    promotion_log.append(f"PR created: {pr_url}")
            else:
                existing_match = re.search(r"(https://github\.com/[^\s]+/pull/\d+)", pr_create_result["stderr"] or "")
                if existing_match:
                    pr_url = existing_match.group(1)
                    promotion_log.append(f"PR already exists: {pr_url}")
                else:
                    promotion_log.append(f"gh pr create failed: {pr_create_result['stderr'][:200]}")
        else:
            promotion_log.append(f"Push failed: {push_result['stderr'][:200]}")

        manual_instructions = []
        if not pr_url:
            manual_instructions = [
                f"cd {workspace_path}",
                "git status",
                f"git push origin {branch_name}",
                f"gh pr create --title {shell_quote(pr_draft.get('title') or 'GitFlick agent run')} --body-file {shell_quote(str(pr_body_path))}",
            ]

        run["status"] = "approved"
        run["updatedAt"] = now_iso()
        run["approval"] = {
            "status": "approved",
            "branchName": branch_name,
            "instructions": manual_instructions,
            "approvedAt": now_iso(),
            "rejectedAt": None,
            "prUrl": pr_url,
            "commitSha": commit_sha,
            "promotionLog": promotion_log,
        }
        write_run(run)

        if pr_url:
            append_timeline(run_id, "approved", "Run approved and PR created", f"Branch `{branch_name}` pushed and PR opened at {pr_url}.")
        else:
            append_timeline(run_id, "approved", "Run approved (manual push needed)", f"Branch `{branch_name}` prepared but auto-push did not succeed. Manual instructions provided.")
        return {"run": read_required_run(run_id)}

    @router.post("/agent-runs/{run_id}/reject")
    def reject_agent_run(run_id: str):
        run = read_required_run(run_id)
        if run["status"] not in {"awaiting_review", "approved", "rejected"}:
            raise HTTPException(status_code=400, detail="Run is not reviewable")

        run["status"] = "rejected"
        run["updatedAt"] = now_iso()
        run["approval"] = {
            "status": "rejected",
            "branchName": run["approval"].get("branchName"),
            "instructions": [],
            "approvedAt": None,
            "rejectedAt": now_iso(),
            "prUrl": None,
            "commitSha": None,
            "promotionLog": ["Rejected by operator."],
        }
        write_run(run)
        append_timeline(run_id, "rejected", "Run rejected", "The patch was rejected and will not be promoted.")
        return {"run": read_required_run(run_id)}

    return router


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def run_dir(run_id: str) -> Path:
    return RUNS_ROOT / run_id


def run_json_path(run_id: str) -> Path:
    return run_dir(run_id) / "run.json"


def ensure_runs_root() -> None:
    RUNS_ROOT.mkdir(parents=True, exist_ok=True)


def shell_quote(value: str) -> str:
    escaped = value.replace("'", "'\"'\"'")
    return f"'{escaped}'"


def sanitize_branch_name(value: str) -> str:
    return re.sub(r"[^a-z0-9._/-]+", "-", (value or "").lower()).strip("-/")[:64] or "gitflick/agent-run"


def build_branch_name(issue: Optional[dict[str, Any]], repo_name: str) -> str:
    issue_number = issue.get("number") if issue else None
    title = issue.get("title") if issue else repo_name
    slug = re.sub(r"[^a-z0-9]+", "-", (title or repo_name).lower()).strip("-")[:38] or "agent-run"
    if issue_number:
        return sanitize_branch_name(f"gitflick/issue-{issue_number}-{slug}")
    return sanitize_branch_name(f"gitflick/{slug}")


def read_required_run(run_id: str) -> dict[str, Any]:
    run = read_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


def read_run(run_id: str) -> Optional[dict[str, Any]]:
    ensure_runs_root()
    path = run_json_path(run_id)
    if not path.exists():
        return None
    with STORE_LOCK:
        return json.loads(path.read_text(encoding="utf-8"))


def write_run(run: dict[str, Any]) -> None:
    ensure_runs_root()
    directory = run_dir(run["id"])
    directory.mkdir(parents=True, exist_ok=True)
    path = run_json_path(run["id"])
    temp_path = directory / "run.tmp.json"
    with STORE_LOCK:
        temp_path.write_text(json.dumps(run, indent=2), encoding="utf-8")
        temp_path.replace(path)


def append_timeline(run_id: str, kind: str, title: str, detail: str = "", level: str = "info") -> None:
    run = read_run(run_id)
    if not run:
        return
    run.setdefault("timeline", []).append(
        {
            "id": uuid.uuid4().hex[:10],
            "at": now_iso(),
            "kind": kind,
            "title": title,
            "detail": detail,
            "level": level,
        }
    )
    run["updatedAt"] = now_iso()
    write_run(run)


def list_runs(repo_url: Optional[str], project_id: Optional[str], limit: int) -> list[dict[str, Any]]:
    ensure_runs_root()
    runs: list[dict[str, Any]] = []
    for directory in RUNS_ROOT.iterdir():
        if not directory.is_dir():
            continue
        run = read_run(directory.name)
        if not run:
            continue
        if repo_url and run.get("repoUrl") != repo_url:
            continue
        if project_id and run.get("projectId") != project_id:
            continue
        runs.append(run)
    runs.sort(key=lambda item: item.get("updatedAt") or item.get("createdAt") or "", reverse=True)
    return runs[: max(1, min(limit, 100))]


def execute_agent_run(run_id: str, github_token: Optional[str]) -> None:
    try:
        set_run_status(run_id, "preparing", "Preparing sandbox", "Fetching issue metadata and cloning the repository.")
        issue = fetch_issue_details(read_required_run(run_id)["issueUrl"], github_token)
        update_run_issue(run_id, issue)
        guard_not_cancelled(run_id)

        workspace_path = prepare_workspace(run_id)
        attach_workspace(run_id, workspace_path)
        guard_not_cancelled(run_id)

        set_run_status(run_id, "running", "Planning fix attempt", "Ranking candidate files and generating a minimal patch plan.")
        run = read_required_run(run_id)
        repo_context = collect_repo_context(workspace_path, issue, run.get("contextHints") or {})
        plan = build_execution_plan(issue, repo_context)
        update_run_plan(run_id, plan)
        guard_not_cancelled(run_id)

        change_set = build_change_set(issue, repo_context, plan)
        if change_set.get("blocked"):
            raise RuntimeError(change_set.get("reason") or "Patch generation was blocked by missing context")
        apply_change_set(workspace_path, change_set)
        append_timeline(run_id, "patch", "Patch applied", change_set.get("summary") or "Candidate changes were written in the sandbox.")
        guard_not_cancelled(run_id)

        set_run_status(run_id, "validating", "Running validations", "Collecting diff artifacts and deterministic validation results.")
        patch_text = collect_patch(workspace_path)
        if not patch_text.strip():
            raise RuntimeError("Run completed without producing a diff")

        diff_stat = collect_diff_stat(workspace_path)
        changed_files = collect_changed_files(workspace_path)
        validation_report = execute_validations(workspace_path)

        append_timeline(run_id, "critique", "Self-critiquing patch", "Running self-critique pass on the generated patch.")
        critique_result = self_critique_patch(issue, plan, changed_files, patch_text, validation_report)

        evaluation = evaluate_run(changed_files, validation_report, run.get("timeline", []))
        change_intent = build_change_intent(issue, plan, changed_files, critique_result)
        test_matrix = build_test_matrix(validation_report, changed_files)
        quality_gates = build_quality_gates(validation_report, changed_files, evaluation)
        pr_draft = build_pr_draft(issue, plan, changed_files, validation_report, evaluation)
        pr_readable = build_pr_readable(issue, plan, changed_files, validation_report, evaluation, change_intent)

        repo_policy = load_repo_policy(workspace_path)
        policy_violations = enforce_policy_gates(repo_policy, changed_files, quality_gates, evaluation)
        if policy_violations:
            append_timeline(run_id, "policy", "Policy violations detected", "; ".join(policy_violations), level="warning")

        artifact_paths = save_artifacts(run_id, patch_text, diff_stat, validation_report, pr_draft)
        finalize_success(
            run_id, patch_text, diff_stat, changed_files, validation_report, evaluation,
            pr_draft, artifact_paths, pr_readable, test_matrix, quality_gates, change_intent,
            critique_result, policy_violations,
        )
    except CancelledRunError:
        finalize_failure(run_id, "cancelled", "Run cancelled", "Cancellation was requested before the run completed.")
    except Exception as exc:
        finalize_failure(run_id, classify_failure(str(exc)), "Run failed", str(exc))


def set_run_status(run_id: str, status: str, title: str, detail: str) -> None:
    if status not in RUN_STATES:
        raise RuntimeError(f"Unknown run state: {status}")
    run = read_required_run(run_id)
    run["status"] = status
    run["updatedAt"] = now_iso()
    if not run.get("startedAt"):
        run["startedAt"] = now_iso()
    write_run(run)
    append_timeline(run_id, status, title, detail)


def update_run_issue(run_id: str, issue: dict[str, Any]) -> None:
    run = read_required_run(run_id)
    run["issue"] = issue
    run["approval"]["branchName"] = build_branch_name(issue, run["repoName"])
    run["updatedAt"] = now_iso()
    write_run(run)
    append_timeline(run_id, "issue", "Issue ingested", f"Loaded issue #{issue.get('number')} and normalized comments/labels.")


def attach_workspace(run_id: str, workspace_path: Path) -> None:
    run = read_required_run(run_id)
    run["artifacts"]["workspacePath"] = str(workspace_path)
    run["updatedAt"] = now_iso()
    write_run(run)
    append_timeline(run_id, "workspace", "Sandbox ready", "Repository clone is ready for patch generation.")


def update_run_plan(run_id: str, plan: dict[str, Any]) -> None:
    run = read_required_run(run_id)
    run["plan"] = plan
    run["updatedAt"] = now_iso()
    write_run(run)
    append_timeline(run_id, "plan", "Execution plan ready", plan.get("summary") or "Generated a minimal issue fix plan.")


def finalize_success(
    run_id: str,
    patch_text: str,
    diff_stat: str,
    changed_files: list[dict[str, Any]],
    validation_report: dict[str, Any],
    evaluation: dict[str, Any],
    pr_draft: dict[str, Any],
    artifact_paths: dict[str, str],
    pr_readable: Optional[dict[str, Any]] = None,
    test_matrix: Optional[dict[str, Any]] = None,
    quality_gates: Optional[dict[str, Any]] = None,
    change_intent: Optional[dict[str, Any]] = None,
    critique_result: Optional[dict[str, Any]] = None,
    policy_violations: Optional[list[str]] = None,
) -> None:
    run = read_required_run(run_id)
    run["status"] = "awaiting_review"
    run["updatedAt"] = now_iso()
    run["completedAt"] = now_iso()
    run["artifacts"]["patch"] = patch_text
    run["artifacts"]["diffStat"] = diff_stat
    run["artifacts"]["changedFiles"] = changed_files
    run["artifacts"]["validation"] = validation_report
    run["artifacts"]["prDraft"] = pr_draft
    run["artifacts"]["prReadable"] = pr_readable
    run["artifacts"]["testMatrix"] = test_matrix
    run["artifacts"]["qualityGates"] = quality_gates
    run["artifacts"]["changeIntent"] = change_intent
    run["artifacts"]["artifactPaths"] = artifact_paths
    run["artifacts"]["failureCategory"] = None
    run["evaluation"] = evaluation
    run["metrics"] = {
        "totalTokensUsed": 0,
        "planningAttempts": 1,
        "patchAttempts": 1,
        "critiqueIterations": 1 if critique_result else 0,
        "validationDepth": len(validation_report.get("commands", [])),
        "artifactConfidence": evaluation.get("confidenceScore", 0),
    }
    if policy_violations:
        run.setdefault("policyViolations", []).extend(policy_violations)
    write_run(run)
    recommendation = (quality_gates or {}).get("recommendation", "review")
    append_timeline(run_id, "review", "Awaiting review", f"Artifacts ready. Recommendation: {recommendation}.")


def finalize_failure(run_id: str, failure_category: str, title: str, detail: str) -> None:
    run = read_required_run(run_id)
    run["status"] = "cancelled" if failure_category == "cancelled" else "failed"
    run["updatedAt"] = now_iso()
    run["completedAt"] = now_iso()
    run["artifacts"]["failureCategory"] = failure_category
    write_run(run)
    append_timeline(run_id, "failed", title, detail, level="error")


def guard_not_cancelled(run_id: str) -> None:
    run = read_required_run(run_id)
    if run.get("control", {}).get("cancelRequested"):
        raise CancelledRunError()


def fetch_issue_details(issue_url: str, github_token: Optional[str]) -> dict[str, Any]:
    match = re.match(r"^https://github\.com/([^/]+)/([^/]+)/issues/(\d+)", issue_url)
    if not match:
        raise RuntimeError("Issue URL must look like https://github.com/owner/repo/issues/123")
    owner, repo, number = match.groups()

    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "GitFlick-AgentRuns/1.0",
    }
    token = github_token or os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    issue_payload = github_api_json(f"https://api.github.com/repos/{owner}/{repo}/issues/{number}", headers)
    comments_payload = []
    comments_url = issue_payload.get("comments_url")
    if comments_url and issue_payload.get("comments", 0) > 0:
        comments_payload = github_api_json(comments_url, headers, default=[])[:3]

    return {
        "owner": owner,
        "repo": repo,
        "number": int(number),
        "title": issue_payload.get("title") or f"Issue {number}",
        "body": issue_payload.get("body") or "",
        "state": issue_payload.get("state"),
        "labels": [label.get("name") for label in issue_payload.get("labels", []) if label.get("name")],
        "author": issue_payload.get("user", {}).get("login"),
        "htmlUrl": issue_payload.get("html_url") or issue_url,
        "comments": [
            {
                "author": item.get("user", {}).get("login") or "unknown",
                "body": (item.get("body") or "")[:1800],
            }
            for item in comments_payload
            if item.get("body")
        ],
    }


def github_api_json(url: str, headers: dict[str, str], default: Any = None) -> Any:
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8")
        raise RuntimeError(f"GitHub API request failed with HTTP {exc.code}: {detail}") from exc
    except Exception as exc:
        if default is not None:
            return default
        raise RuntimeError(f"GitHub API request failed: {exc}") from exc


def prepare_workspace(run_id: str) -> Path:
    run = read_required_run(run_id)
    workspace = run_dir(run_id) / "workspace"
    if workspace.exists():
        shutil.rmtree(workspace)
    workspace.parent.mkdir(parents=True, exist_ok=True)

    repo_url = run["repoUrl"]
    branch = run.get("branch")
    project_id = run.get("projectId")

    # Prefer one-time Phase-1 cache: no network clone if Studio already ensured workspace.
    if project_id:
        try:
            from repo_workspace import get_valid_cache_for_run, materialize_run_workspace

            cache = get_valid_cache_for_run(str(project_id), repo_url)
            if cache is not None:
                materialize_run_workspace(cache, workspace, repo_url, branch)
                append_timeline(
                    run_id,
                    "workspace",
                    "Sandbox from project cache",
                    "Reused Phase-1 git checkout (local copy); no re-clone from GitHub.",
                )
                return workspace
        except Exception as exc:
            print(f"⚠️  Project workspace cache unavailable, cloning from network: {exc}")

    clone_result = run_subprocess(
        ["git", "clone", "--depth", "1", repo_url, str(workspace)],
        cwd=str(workspace.parent),
        timeout_seconds=120,
    )
    if clone_result["exitCode"] != 0:
        raise RuntimeError(clone_result["stderr"] or clone_result["stdout"] or "Repository clone failed")

    if branch:
        checkout_result = run_subprocess(
            ["git", "checkout", branch],
            cwd=str(workspace),
            timeout_seconds=20,
        )
        if checkout_result["exitCode"] != 0:
            raise RuntimeError(checkout_result["stderr"] or checkout_result["stdout"] or "Branch checkout failed")
    return workspace


def collect_repo_context(
    workspace_path: Path,
    issue: dict[str, Any],
    context_hints: dict[str, Any],
) -> dict[str, Any]:
    tracked_files = list_repo_files(workspace_path)
    package_json = load_json_file(workspace_path / "package.json")
    top_directories = summarize_directories(tracked_files)
    repo_analysis = analyze_repo_shape(workspace_path, tracked_files, package_json)
    candidate_files = select_candidate_files(workspace_path, tracked_files, issue, context_hints)
    candidate_files = expand_candidate_files(workspace_path, tracked_files, candidate_files)
    runner_notes = build_runner_notes(repo_analysis)

    documents = []
    if runner_notes:
        documents.append({"path": "__gitflick__/runner-notes.md", "content": runner_notes})
    for relative_path in candidate_files:
        content = read_text_safe(workspace_path / relative_path, 14000)
        if content:
            documents.append({"path": relative_path, "content": content})

    return {
        "workspacePath": str(workspace_path),
        "trackedFiles": tracked_files,
        "candidateFiles": candidate_files,
        "candidateDocuments": documents,
        "topDirectories": top_directories,
        "packageJson": package_json,
        "repoAnalysis": repo_analysis,
        "runnerNotes": runner_notes,
        "contextHints": context_hints,
    }


def list_repo_files(workspace_path: Path) -> list[str]:
    result = run_subprocess(["git", "ls-files"], cwd=str(workspace_path), timeout_seconds=20)
    if result["exitCode"] != 0:
        raise RuntimeError(result["stderr"] or result["stdout"] or "Failed to enumerate repository files")
    return [line.strip() for line in result["stdout"].splitlines() if line.strip()]


def select_candidate_files(
    workspace_path: Path,
    tracked_files: list[str],
    issue: dict[str, Any],
    context_hints: dict[str, Any],
) -> list[str]:
    tokens = tokenize_issue(issue)
    hinted = {
        normalize_rel_path(path)
        for path in [
            *context_hints.get("focusFiles", []),
            *context_hints.get("hubFiles", []),
            *context_hints.get("entryFiles", []),
        ]
        if normalize_rel_path(path)
    }
    scored: list[tuple[int, str]] = []

    for relative_path in tracked_files:
        normalized = normalize_rel_path(relative_path)
        absolute_path = workspace_path / normalized
        if absolute_path.suffix.lower() not in SOURCE_EXTENSIONS:
            continue
        if absolute_path.stat().st_size > 90_000:
            continue

        score = 0
        lower_path = normalized.lower()
        if normalized in hinted:
            score += 18
        for token in tokens:
            if token in lower_path:
                score += 8
        excerpt = read_text_safe(absolute_path, 8000).lower()
        for token in tokens[:12]:
            if token in excerpt:
                score += 4
        if lower_path.endswith(("test.ts", "test.tsx", "test.js", "spec.ts", "spec.tsx", "test.py", "spec.py")):
            score += 2
        if score > 0:
            scored.append((score, normalized))

    scored.sort(key=lambda item: (-item[0], item[1]))
    selected = [path for _, path in scored[:8]]
    if selected:
        return selected

    fallback = []
    for relative_path in tracked_files:
        absolute_path = workspace_path / relative_path
        if absolute_path.suffix.lower() in SOURCE_EXTENSIONS and absolute_path.stat().st_size <= 90_000:
            fallback.append(relative_path)
        if len(fallback) >= 6:
            break
    return fallback


def expand_candidate_files(
    workspace_path: Path,
    tracked_files: list[str],
    initial_files: list[str],
    limit: int = 14,
) -> list[str]:
    tracked_lookup = {normalize_rel_path(path) for path in tracked_files}
    ordered: list[str] = []
    seen: set[str] = set()

    def add(path: str) -> None:
        normalized = normalize_rel_path(path)
        if not normalized or normalized not in tracked_lookup or normalized in seen:
            return
        seen.add(normalized)
        ordered.append(normalized)

    for path in initial_files:
        add(path)

    for metadata_path in ("package.json", "tsconfig.json", "README.md", "pnpm-workspace.yaml", "turbo.json"):
        add(metadata_path)

    queue = list(ordered)
    while queue and len(ordered) < limit:
        current = queue.pop(0)
        content = read_text_safe(workspace_path / current, 12000)
        if content:
            for related in resolve_local_imports(current, content, tracked_lookup):
                if len(ordered) >= limit:
                    break
                if related not in seen:
                    add(related)
                    queue.append(related)
        if len(ordered) >= limit:
            break
        for sibling in find_sibling_files(current, tracked_lookup):
            if len(ordered) >= limit:
                break
            add(sibling)

    return ordered[:limit]


def resolve_local_imports(
    source_path: str,
    content: str,
    tracked_lookup: set[str],
) -> list[str]:
    source_dir = PurePosixPath(source_path).parent
    resolved: list[str] = []
    seen: set[str] = set()
    extensions = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json")

    for match in IMPORT_SPECIFIER_RE.finditer(content or ""):
        specifier = next((group for group in match.groups() if group), "")
        if not specifier.startswith("."):
            continue
        base = source_dir.joinpath(specifier)
        candidate_paths = []
        for extension in extensions:
            candidate_paths.append(str(base) + extension)
        for index_name in ("index.ts", "index.tsx", "index.js", "index.jsx", "index.mjs", "index.cjs"):
            candidate_paths.append(str(base / index_name))

        for candidate in candidate_paths:
            normalized = normalize_rel_path(candidate)
            if normalized in tracked_lookup and normalized not in seen:
                seen.add(normalized)
                resolved.append(normalized)
    return resolved


def find_sibling_files(source_path: str, tracked_lookup: set[str], max_siblings: int = 4) -> list[str]:
    pure_path = PurePosixPath(source_path)
    parent = pure_path.parent
    suffix = pure_path.suffix.lower()
    siblings = [
        path
        for path in tracked_lookup
        if PurePosixPath(path).parent == parent and PurePosixPath(path).suffix.lower() == suffix and path != source_path
    ]
    siblings.sort()
    return siblings[:max_siblings]


def analyze_repo_shape(
    workspace_path: Path,
    tracked_files: list[str],
    package_json: Optional[dict[str, Any]],
) -> dict[str, Any]:
    package_json = package_json or {}
    dependency_sections = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")
    workspace_dependencies = sorted(
        name
        for section in dependency_sections
        for name, value in (package_json.get(section) or {}).items()
        if isinstance(value, str) and value.startswith("workspace:")
    )
    has_workspace_config = bool(package_json.get("workspaces")) or (workspace_path / "pnpm-workspace.yaml").exists()
    monorepo_dirs = any(path.startswith(("packages/", "apps/")) for path in tracked_files)
    readme_excerpt = read_text_safe(workspace_path / "README.md", 5000).lower()
    standalone_warning = "cannot yet be built on its own" in readme_excerpt or "dependencies on utils and types from the monorepo" in readme_excerpt
    partial_workspace_repo = bool(workspace_dependencies) and not has_workspace_config and not monorepo_dirs
    diff_only_validation = partial_workspace_repo or standalone_warning
    return {
        "workspaceDependencies": workspace_dependencies[:12],
        "workspaceDependencyCount": len(workspace_dependencies),
        "hasWorkspaceConfig": has_workspace_config,
        "monorepoLayoutDetected": monorepo_dirs,
        "standaloneWarning": standalone_warning,
        "partialWorkspaceRepo": partial_workspace_repo,
        "validationMode": "diff_only" if diff_only_validation else "standard",
    }


def build_runner_notes(repo_analysis: dict[str, Any]) -> str:
    notes: list[str] = []
    if repo_analysis.get("workspaceDependencies"):
        notes.append(
            "Workspace dependencies referenced by package.json: "
            + ", ".join(repo_analysis["workspaceDependencies"][:8])
        )
    if repo_analysis.get("partialWorkspaceRepo") or repo_analysis.get("standaloneWarning"):
        notes.append(
            "This checkout appears to be a partial package extracted from a larger monorepo. "
            "Some imported workspace packages may be missing from the repository snapshot."
        )
        notes.append(
            "When external workspace packages are unavailable, infer the smallest local patch from neighboring files "
            "instead of blocking immediately on missing package definitions."
        )
    if repo_analysis.get("validationMode") == "diff_only":
        notes.append(
            "Deterministic validation should prefer `git diff --check` because install/build may fail for reasons unrelated "
            "to the proposed patch."
        )
    return "\n".join(f"- {note}" for note in notes)


def summarize_directories(tracked_files: list[str]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for relative_path in tracked_files:
        head = relative_path.split("/", 1)[0] if "/" in relative_path else "(root)"
        counts[head] = counts.get(head, 0) + 1
    items = [{"label": label, "count": count} for label, count in counts.items()]
    items.sort(key=lambda item: item["count"], reverse=True)
    return items[:8]


def tokenize_issue(issue: dict[str, Any]) -> list[str]:
    raw = " ".join(
        [
            issue.get("title") or "",
            issue.get("body") or "",
            " ".join(issue.get("labels", [])),
            " ".join(comment.get("body", "") for comment in issue.get("comments", [])),
        ]
    ).lower()
    tokens = re.findall(r"[a-z0-9_./-]{4,}", raw)
    unique: list[str] = []
    for token in tokens:
        if token in STOP_WORDS or token in unique:
            continue
        unique.append(token)
    return unique[:24]


def normalize_rel_path(value: str) -> str:
    normalized = value.replace("\\", "/").strip().lstrip("/")
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def build_execution_plan(issue: dict[str, Any], repo_context: dict[str, Any]) -> dict[str, Any]:
    prompt = f"""
You are GitFlick's planning pass for an autonomous issue fix run.
Return strict JSON with keys:
- summary: string
- strategy: string
- tasks: array of {{title: string, detail: string}}
- risks: array of string
- validation_focus: array of string

Issue title: {issue.get("title")}
Issue body:
{truncate_text(issue.get("body", ""), 5000)}

Repo context:
- Candidate files: {json.dumps(repo_context.get("candidateFiles", []))}
- Top directories: {json.dumps(repo_context.get("topDirectories", []))}
- Technologies: {json.dumps((repo_context.get("contextHints") or {}).get("technologies", []))}
- Architecture hint: {(repo_context.get("contextHints") or {}).get("architecture") or "unknown"}
- Repo analysis: {json.dumps(repo_context.get("repoAnalysis", {}), indent=2)[:1800]}
- Package scripts: {json.dumps(((repo_context.get("packageJson") or {}).get("scripts") or {}), indent=2)[:2000]}
"""
    response = request_gemini_json(prompt, max_output_tokens=2048)
    if response:
        return response
    return {
        "summary": f"Investigate and patch issue #{issue.get('number')} with the smallest safe diff.",
        "strategy": "Target high-signal files from issue tokens and Studio graph hints, then run deterministic repo validations.",
        "tasks": [
            {
                "title": "Inspect likely files",
                "detail": f"Focus on {', '.join(repo_context.get('candidateFiles', [])[:3]) or 'the highest-ranked source files'}.",
            },
            {
                "title": "Apply minimal fix",
                "detail": "Keep scope local and add or update tests when practical.",
            },
        ],
        "risks": ["Model planning fallback was used because structured planning output was unavailable."],
        "validation_focus": ["tests", "lint/build", "sensitive file review"],
    }


def build_change_set(issue: dict[str, Any], repo_context: dict[str, Any], plan: dict[str, Any]) -> dict[str, Any]:
    documents = list(repo_context.get("candidateDocuments", []))
    tracked_lookup = {normalize_rel_path(path) for path in repo_context.get("trackedFiles", [])}
    attempt_guidance = ""
    last_blocked_reason = ""

    for attempt in range(3):
        prompt = f"""
You are GitFlick's mini-SWE executor.
Return strict JSON in one of these shapes:

Success:
{{
  "summary": "string",
  "changes": [
    {{
      "path": "relative/path.ext",
      "action": "replace" | "create" | "delete",
      "why": "string",
      "content": "full file contents for replace/create"
    }}
  ]
}}

Blocked:
{{
  "blocked": true,
  "reason": "string",
  "needed_files": ["relative/path.ext"]
}}

Rules:
- Keep the patch as small as possible.
- Prefer modifying the files shown below. If you need more context from other tracked files, return blocked with `needed_files`.
- Prefer updating tests when that is the cheapest reliable validation path.
- The repository checkout may be incomplete. If a workspace package or sibling monorepo package is missing, do not block on that alone. Infer the narrowest local patch from neighboring files or add a small local helper/shim when that is the safest path.
- Synthetic `__gitflick__/runner-notes.md` is read-only guidance, not a target for edits.
- Do not include markdown fences.

Issue title: {issue.get("title")}
Issue body:
{truncate_text(issue.get("body", ""), 6000)}

Plan:
{json.dumps(plan, indent=2)[:3500]}

Repo analysis:
{json.dumps(repo_context.get("repoAnalysis", {}), indent=2)[:2200]}

Attempt guidance:
{attempt_guidance or "None"}

Available files:
{json.dumps([document["path"] for document in documents], indent=2)}

File contents:
{render_documents(documents)}
"""
        result = request_gemini_json(prompt, max_output_tokens=8192)
        if not result:
            raise RuntimeError("Gemini API key is required for autonomous patch generation")

        if not result.get("blocked"):
            return result

        last_blocked_reason = (result.get("reason") or "").strip()
        extra_documents, unavailable_files = load_requested_documents(
            Path(repo_context["workspacePath"]),
            tracked_lookup,
            documents,
            result.get("needed_files") or [],
        )
        if extra_documents:
            documents.extend(extra_documents)
            attempt_guidance = (
                "Additional tracked files requested by the previous attempt are now available: "
                + ", ".join(document["path"] for document in extra_documents[:6])
            )
            if unavailable_files:
                attempt_guidance += (
                    ". These requested paths are not present in the checkout: "
                    + ", ".join(unavailable_files[:6])
                )
            continue

        if should_force_best_effort(repo_context, last_blocked_reason, unavailable_files):
            attempt_guidance = build_best_effort_guidance(repo_context, last_blocked_reason, unavailable_files)
            continue

        return result

    raise RuntimeError(last_blocked_reason or "Patch generation was blocked because the runner could not gather enough context")


def load_requested_documents(
    workspace_path: Path,
    tracked_lookup: set[str],
    documents: list[dict[str, str]],
    requested_files: list[str],
) -> tuple[list[dict[str, str]], list[str]]:
    existing = {document["path"] for document in documents}
    extra_documents: list[dict[str, str]] = []
    unavailable_files: list[str] = []

    for requested in requested_files[:6]:
        normalized = normalize_rel_path(requested)
        if not normalized:
            continue
        if normalized in tracked_lookup and normalized not in existing:
            content = read_text_safe(workspace_path / normalized, 14000)
            if content:
                extra_documents.append({"path": normalized, "content": content})
                continue
        unavailable_files.append(normalized)

    return extra_documents, unavailable_files


def should_force_best_effort(
    repo_context: dict[str, Any],
    blocked_reason: str,
    unavailable_files: list[str],
) -> bool:
    repo_analysis = repo_context.get("repoAnalysis") or {}
    lower_reason = (blocked_reason or "").lower()
    missing_context = unavailable_files or any(
        token in lower_reason
        for token in (
            "without access",
            "missing",
            "not present",
            "not available",
            "workspace",
            "monorepo",
            "schema",
            "package",
        )
    )
    return bool(missing_context and (repo_analysis.get("partialWorkspaceRepo") or repo_analysis.get("standaloneWarning") or unavailable_files))


def build_best_effort_guidance(
    repo_context: dict[str, Any],
    blocked_reason: str,
    unavailable_files: list[str],
) -> str:
    unavailable_line = (
        "Unavailable requested paths: " + ", ".join(unavailable_files[:8])
        if unavailable_files
        else "No additional tracked files are available for the missing dependency."
    )
    return "\n".join(
        [
            "Best-effort fallback mode is now active.",
            unavailable_line,
            f"Previous blocked reason: {blocked_reason or 'missing context'}",
            "Do not ask for external workspace packages again.",
            "Infer the change from the available repository files and return the smallest reviewable local patch.",
            "If an exact upstream schema is missing, create or adjust a narrow local helper/shim inside this repo instead of blocking.",
            "The repository may not build standalone, so focus on producing a coherent diff and explain assumptions in the summary.",
        ]
    )


def self_critique_patch(
    issue: dict[str, Any],
    plan: dict[str, Any],
    changed_files: list[dict[str, Any]],
    patch_text: str,
    validation_report: dict[str, Any],
) -> dict[str, Any]:
    """Ask the model to critique its own patch before finalizing."""
    prompt = f"""
You are GitFlick's self-critique pass. You just generated a patch for a GitHub issue.
Review the patch critically and return strict JSON:
{{
  "hypothesis": "One sentence: what is the root cause and how does the patch fix it?",
  "selfCritique": "2-4 sentences: what could go wrong, edge cases missed, assumptions made.",
  "evidenceSufficiency": "strong" | "moderate" | "weak",
  "shouldRefine": false,
  "refinementHint": ""
}}

Issue: {issue.get("title")}
Plan summary: {plan.get("summary", "")}

Changed files: {json.dumps([f["path"] for f in changed_files])}

Patch (first 3000 chars):
{truncate_text(patch_text, 3000)}

Validation status: {validation_report.get("overallStatus", "not_run")}
Validation notes: {json.dumps(validation_report.get("notes", []))}
"""
    result = request_gemini_json(prompt, max_output_tokens=1024)
    if result:
        return result
    return {
        "hypothesis": plan.get("strategy") or "Addresses the issue with the smallest safe diff.",
        "selfCritique": "Self-critique was unavailable; review the patch manually.",
        "evidenceSufficiency": "moderate",
        "shouldRefine": False,
        "refinementHint": "",
    }


def load_repo_policy(workspace_path: Path) -> dict[str, Any]:
    """Load .gitflick-agent.yaml or return defaults."""
    policy_path = workspace_path / ".gitflick-agent.yaml"
    if not policy_path.exists():
        policy_path = workspace_path / ".gitflick-agent.yml"
    if not policy_path.exists():
        return {
            "allowedCommands": [],
            "forbiddenPaths": [],
            "requiredChecks": [],
            "maxFilesChanged": 15,
            "autoPromoteRisk": "low",
        }
    try:
        import yaml
        return yaml.safe_load(policy_path.read_text(encoding="utf-8")) or {}
    except Exception:
        raw = policy_path.read_text(encoding="utf-8")
        return json.loads(raw) if raw.strip().startswith("{") else {}


def enforce_policy_gates(
    repo_policy: dict[str, Any],
    changed_files: list[dict[str, Any]],
    quality_gates: dict[str, Any],
    evaluation: dict[str, Any],
) -> list[str]:
    """Return list of policy violations. Empty means clear to promote."""
    violations = []
    max_files = repo_policy.get("maxFilesChanged", 15)
    if len(changed_files) > max_files:
        violations.append(f"Changed {len(changed_files)} files; policy limit is {max_files}.")

    forbidden = repo_policy.get("forbiddenPaths") or []
    for f in changed_files:
        for pattern in forbidden:
            if pattern in f.get("path", ""):
                violations.append(f"File {f['path']} matches forbidden pattern '{pattern}'.")

    required_checks = repo_policy.get("requiredChecks") or []
    gate_statuses = {g["gate"]: g["status"] for g in quality_gates.get("gates", [])}
    for check in required_checks:
        status = gate_statuses.get(check, "not_run")
        if status not in ("passed", "skipped"):
            violations.append(f"Required check '{check}' did not pass (status: {status}).")

    return violations


def render_documents(documents: list[dict[str, str]]) -> str:
    return "\n\n".join(f"----- FILE: {document['path']} -----\n{document['content']}" for document in documents)


def request_gemini_json(prompt: str, max_output_tokens: int) -> Optional[dict[str, Any]]:
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("VITE_GEMINI_API_KEY") or "").strip()
    if not api_key:
        return None

    model = (
        os.getenv("GEMINI_MODEL")
        or os.getenv("VITE_GEMINI_MODEL")
        or "gemini-2.5-flash"
    ).replace("google:", "").strip()

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.15,
            "topK": 24,
            "topP": 0.8,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
        },
    }
    request = urllib.request.Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = json.loads(response.read().decode("utf-8"))
            text = raw.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return parse_model_json(text)
    except Exception:
        return None


def parse_model_json(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise
        return json.loads(match.group(0))


def apply_change_set(workspace_path: Path, change_set: dict[str, Any]) -> None:
    changes = change_set.get("changes") or []
    if not changes:
        raise RuntimeError("Patch generation did not return any file changes")

    workspace_root = workspace_path.resolve()
    for change in changes:
        relative_path = normalize_rel_path(change.get("path") or "")
        if not relative_path:
            raise RuntimeError("Patch generation returned an empty path")
        if any(pattern.search(relative_path) for pattern in WRITE_DENY_PATTERNS):
            raise RuntimeError(f"Patch violated path policy: {relative_path}")

        absolute_path = (workspace_path / relative_path).resolve()
        if not str(absolute_path).startswith(str(workspace_root)):
            raise RuntimeError(f"Unsafe patch path rejected: {relative_path}")

        action = (change.get("action") or "replace").lower()
        if action == "delete":
            if absolute_path.exists():
                absolute_path.unlink()
            continue

        content = change.get("content")
        if not isinstance(content, str):
            raise RuntimeError(f"Patch change for {relative_path} is missing file contents")
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_text(content, encoding="utf-8")


def collect_patch(workspace_path: Path) -> str:
    result = run_subprocess(["git", "diff", "--no-ext-diff", "--binary"], cwd=str(workspace_path), timeout_seconds=30)
    if result["exitCode"] != 0:
        raise RuntimeError(result["stderr"] or result["stdout"] or "Failed to collect diff artifact")
    return result["stdout"]


def collect_diff_stat(workspace_path: Path) -> str:
    result = run_subprocess(["git", "diff", "--stat"], cwd=str(workspace_path), timeout_seconds=20)
    return result["stdout"] if result["exitCode"] == 0 else ""


def collect_changed_files(workspace_path: Path) -> list[dict[str, Any]]:
    result = run_subprocess(["git", "diff", "--numstat", "--find-renames"], cwd=str(workspace_path), timeout_seconds=20)
    if result["exitCode"] != 0:
        return []

    changed_files = []
    for line in result["stdout"].splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        additions, deletions, path = parts[0], parts[1], normalize_rel_path(parts[2])
        add_count = int(additions) if additions.isdigit() else 0
        delete_count = int(deletions) if deletions.isdigit() else 0
        changed_files.append(
            {
                "path": path,
                "additions": add_count,
                "deletions": delete_count,
                "changedLines": add_count + delete_count,
                "sensitive": any(pattern.search(path) for pattern in SENSITIVE_PATH_PATTERNS),
            }
        )
    return changed_files


def execute_validations(workspace_path: Path) -> dict[str, Any]:
    commands: list[list[str]] = []
    install_command: Optional[list[str]] = None
    package_json = load_json_file(workspace_path / "package.json") or {}
    tracked_files = list_repo_files(workspace_path)
    repo_analysis = analyze_repo_shape(workspace_path, tracked_files, package_json)
    scripts = package_json.get("scripts") or {}
    package_manager = detect_package_manager(workspace_path)
    notes: list[str] = []

    if repo_analysis.get("validationMode") == "diff_only":
        commands.append(["git", "diff", "--check"])
        notes.append(
            "Skipped install/build validation because the repository references workspace dependencies that are not fully present in this checkout."
        )
    elif package_manager and not (workspace_path / "node_modules").exists():
        install_command = ["npm", "install"] if package_manager == "npm" else [package_manager, "install"]

    if not commands and package_manager:
        if "test" in scripts:
            commands.append(["npm", "test"] if package_manager == "npm" else [package_manager, "run", "test"])
        if "lint" in scripts:
            commands.append([package_manager, "run", "lint"])
        if "build" in scripts:
            commands.append([package_manager, "run", "build"])
        if not commands and "typecheck" in scripts:
            commands.append([package_manager, "run", "typecheck"])
    elif not commands and ((workspace_path / "pytest.ini").exists() or (workspace_path / "pyproject.toml").exists()):
        python_bin = shutil.which("python3") or shutil.which("python")
        if python_bin:
            requirements_path = workspace_path / "requirements.txt"
            if requirements_path.exists():
                install_command = [python_bin, "-m", "pip", "install", "-r", "requirements.txt"]
            commands.append([python_bin, "-m", "pytest"])

    if not commands:
        commands.append(["git", "diff", "--check"])
        if repo_analysis.get("validationMode") != "diff_only":
            notes.append("Fell back to `git diff --check` because no deterministic test, lint, or build command was available.")

    results = []
    if install_command:
        install_result = run_subprocess(install_command, cwd=str(workspace_path), timeout_seconds=300)
        install_result["kind"] = "install"
        results.append(install_result)
        if install_result["exitCode"] != 0:
            notes.append("Dependency installation failed before validations could run.")
            return {"overallStatus": "failed", "commands": results, "mode": repo_analysis.get("validationMode"), "notes": notes}

    for command in commands[:3]:
        result = run_subprocess(command, cwd=str(workspace_path), timeout_seconds=300)
        result["kind"] = "validation"
        results.append(result)

    validation_commands = [entry for entry in results if entry.get("kind") == "validation"]
    if validation_commands and all(entry["exitCode"] == 0 for entry in validation_commands):
        overall_status = "passed"
    elif any(entry["exitCode"] == 0 for entry in validation_commands):
        overall_status = "partial"
    elif validation_commands:
        overall_status = "failed"
    else:
        overall_status = "not_run"

    return {"overallStatus": overall_status, "commands": results, "mode": repo_analysis.get("validationMode"), "notes": notes}


def detect_package_manager(workspace_path: Path) -> Optional[str]:
    if (workspace_path / "pnpm-lock.yaml").exists() and shutil.which("pnpm"):
        return "pnpm"
    if (workspace_path / "yarn.lock").exists() and shutil.which("yarn"):
        return "yarn"
    if (workspace_path / "bun.lockb").exists() and shutil.which("bun"):
        return "bun"
    if (workspace_path / "package.json").exists() and shutil.which("npm"):
        return "npm"
    return None


def run_subprocess(command: list[str], cwd: str, timeout_seconds: int) -> dict[str, Any]:
    started = time.time()
    env = os.environ.copy()
    env["CI"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"

    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "command": " ".join(command),
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-20000:],
            "stderr": (completed.stderr or "")[-20000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "command": " ".join(command),
            "exitCode": 124,
            "stdout": (exc.stdout or "")[-20000:] if isinstance(exc.stdout, str) else "",
            "stderr": ((exc.stderr or "")[-20000:] if isinstance(exc.stderr, str) else "") or f"Timed out after {timeout_seconds}s",
            "durationMs": int((time.time() - started) * 1000),
        }


def evaluate_run(
    changed_files: list[dict[str, Any]],
    validation_report: dict[str, Any],
    timeline: list[dict[str, Any]],
) -> dict[str, Any]:
    total_changed_lines = sum(item.get("changedLines", 0) for item in changed_files)
    sensitive_files = [item["path"] for item in changed_files if item.get("sensitive")]
    validation_commands = [entry for entry in validation_report.get("commands", []) if entry.get("kind") == "validation"]
    passed_count = len([entry for entry in validation_commands if entry.get("exitCode") == 0])

    risk_score = 0.18
    risk_reasons = []
    if sensitive_files:
        risk_score += 0.32
        risk_reasons.append(f"Sensitive files changed: {', '.join(sensitive_files[:4])}")
    if total_changed_lines > 220:
        risk_score += 0.18
        risk_reasons.append("Patch is large for a V1 autonomous run.")
    if len(changed_files) > 5:
        risk_score += 0.08
        risk_reasons.append("Diff spans several files.")
    if validation_report.get("overallStatus") != "passed":
        risk_score += 0.2
        risk_reasons.append("Validation did not fully pass.")
    risk_score = max(0.0, min(risk_score, 1.0))

    confidence_score = 0.2
    confidence_reasons = []
    if validation_commands:
        confidence_score += 0.4 * (passed_count / max(1, len(validation_commands)))
    if changed_files:
        confidence_score += 0.12
        confidence_reasons.append("Run produced a concrete diff artifact.")
    if total_changed_lines <= 120:
        confidence_score += 0.12
        confidence_reasons.append("Patch stayed narrow.")
    if len(timeline) >= 4:
        confidence_score += 0.05
        confidence_reasons.append("Run completed the full planned pipeline.")
    if sensitive_files:
        confidence_score -= 0.1
        confidence_reasons.append("Confidence reduced because sensitive paths changed.")
    if validation_report.get("overallStatus") == "passed":
        confidence_reasons.append("All selected validations passed.")
    elif validation_report.get("overallStatus") == "partial":
        confidence_reasons.append("Some validations passed, but not all.")
    else:
        confidence_reasons.append("Validation evidence is weak or failing.")
    confidence_score = max(0.0, min(confidence_score, 1.0))

    return {
        "riskLevel": score_band(risk_score),
        "riskScore": round(risk_score, 2),
        "riskReasons": risk_reasons,
        "confidenceLevel": inverse_score_band(confidence_score),
        "confidenceScore": round(confidence_score, 2),
        "confidenceReasons": confidence_reasons,
    }


def score_band(score: float) -> str:
    if score >= 0.72:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def inverse_score_band(score: float) -> str:
    if score >= 0.72:
        return "high"
    if score >= 0.45:
        return "medium"
    return "low"


def build_pr_draft(
    issue: dict[str, Any],
    plan: dict[str, Any],
    changed_files: list[dict[str, Any]],
    validation_report: dict[str, Any],
    evaluation: dict[str, Any],
) -> dict[str, Any]:
    title = issue.get("title") or "GitFlick agent patch"
    if not title.lower().startswith("fix"):
        title = f"Fix: {title}"

    changed_lines = [
        f"- `{item['path']}` (+{item['additions']} / -{item['deletions']})"
        for item in changed_files[:8]
    ]
    validation_lines = [
        f"- [{'PASS' if command.get('exitCode') == 0 else 'FAIL'}] `{command.get('command')}` ({command.get('durationMs')} ms)"
        for command in validation_report.get("commands", [])
    ]
    validation_notes = [f"- {note}" for note in (validation_report.get("notes") or [])[:4]]

    body = "\n".join(
        [
            "## Problem",
            truncate_text(issue.get("body") or issue.get("title") or "No issue body provided.", 1200),
            "",
            "## Fix Strategy",
            f"- {plan.get('summary') or 'Apply the smallest safe diff that resolves the issue.'}",
            *[
                f"- {task.get('title')}: {task.get('detail')}"
                for task in (plan.get("tasks") or [])[:4]
            ],
            "",
            "## Changed Files",
            *(changed_lines if changed_lines else ["- No changed files were captured."]),
            "",
            "## Validation",
            *(validation_lines if validation_lines else ["- No validation commands were run."]),
            *validation_notes,
            "",
            "## Residual Risk",
            f"- Risk: {evaluation.get('riskLevel')} ({evaluation.get('riskScore')})",
            *[f"- {reason}" for reason in (evaluation.get("riskReasons") or [])[:4]],
            "",
            "## Confidence",
            f"- Confidence: {evaluation.get('confidenceLevel')} ({evaluation.get('confidenceScore')})",
            *[f"- {reason}" for reason in (evaluation.get("confidenceReasons") or [])[:4]],
        ]
    )
    return {"title": title, "body": body.strip()}


def build_pr_readable(
    issue: dict[str, Any],
    plan: dict[str, Any],
    changed_files: list[dict[str, Any]],
    validation_report: dict[str, Any],
    evaluation: dict[str, Any],
    change_intent: dict[str, Any],
) -> dict[str, Any]:
    title = issue.get("title") or "GitFlick agent patch"
    if not title.lower().startswith("fix"):
        title = f"Fix: {title}"

    sections = [
        {
            "heading": "Summary",
            "body": plan.get("summary") or "Apply the smallest safe diff that resolves the issue.",
            "kind": "summary",
        },
        {
            "heading": "What changed and why",
            "body": change_intent.get("hypothesis") or plan.get("strategy") or "",
            "kind": "strategy",
        },
        {
            "heading": "Files modified",
            "body": "\n".join(
                f"{item['path']} (+{item['additions']} / -{item['deletions']})"
                for item in changed_files[:10]
            ) or "No files changed.",
            "kind": "changes",
        },
        {
            "heading": "Validation results",
            "body": "\n".join(
                f"{'PASS' if cmd.get('exitCode') == 0 else 'FAIL'} {cmd.get('command')} ({cmd.get('durationMs')}ms)"
                for cmd in validation_report.get("commands", [])
            ) or "No validation commands executed.",
            "kind": "validation",
        },
        {
            "heading": "Risk assessment",
            "body": f"Risk: {evaluation.get('riskLevel')} ({evaluation.get('riskScore')})\n" +
                    "\n".join(evaluation.get("riskReasons") or ["No specific risk flags."]),
            "kind": "risk",
        },
        {
            "heading": "Confidence",
            "body": f"Confidence: {evaluation.get('confidenceLevel')} ({evaluation.get('confidenceScore')})\n" +
                    "\n".join(evaluation.get("confidenceReasons") or []),
            "kind": "confidence",
        },
    ]

    if change_intent.get("selfCritique"):
        sections.append({
            "heading": "Self-critique",
            "body": change_intent["selfCritique"],
            "kind": "notes",
        })

    sensitive_files = [f["path"] for f in changed_files if f.get("sensitive")]
    checklist = [
        {"label": "Patch applies cleanly", "checked": bool(changed_files)},
        {"label": "Validation suite passed", "checked": validation_report.get("overallStatus") == "passed"},
        {"label": "No sensitive files modified", "checked": len(sensitive_files) == 0},
        {"label": "Blast radius is narrow", "checked": len(changed_files) <= 5},
        {"label": "Self-critique completed", "checked": bool(change_intent.get("selfCritique"))},
    ]

    reviewer_prompts = []
    if sensitive_files:
        reviewer_prompts.append(f"Review sensitive files closely: {', '.join(sensitive_files[:4])}")
    if evaluation.get("riskLevel") == "high":
        reviewer_prompts.append("High risk detected; consider manual testing before merge.")
    if change_intent.get("evidenceSufficiency") == "weak":
        reviewer_prompts.append("Evidence grounding is weak; verify the fix addresses the root cause.")
    if validation_report.get("overallStatus") != "passed":
        reviewer_prompts.append("Not all validation checks passed; inspect failures before approving.")

    return {
        "title": title,
        "sections": sections,
        "checklist": checklist,
        "reviewerPrompts": reviewer_prompts,
    }


def build_test_matrix(validation_report: dict[str, Any], changed_files: list[dict[str, Any]]) -> dict[str, Any]:
    impacted_paths = [f["path"] for f in changed_files]
    suites = []
    total_duration = 0

    for cmd in validation_report.get("commands", []):
        if cmd.get("kind") == "install":
            continue
        duration = cmd.get("durationMs", 0)
        total_duration += duration
        exit_code = cmd.get("exitCode", -1)

        if exit_code == 124:
            status = "timeout"
        elif exit_code == 0:
            status = "passed"
        else:
            status = "failed"

        failure_summary = None
        if status == "failed":
            stderr = cmd.get("stderr", "")
            stdout = cmd.get("stdout", "")
            raw = (stderr or stdout or "").strip()
            failure_lines = [line for line in raw.split("\n") if line.strip()][-5:]
            failure_summary = "\n".join(failure_lines)[:500] if failure_lines else "Command exited with non-zero status."

        command_name = cmd.get("command", "")
        suite_name = "test" if "test" in command_name else "lint" if "lint" in command_name else "build" if "build" in command_name else "check"

        suites.append({
            "suite": suite_name,
            "command": command_name,
            "status": status,
            "durationMs": duration,
            "exitCode": exit_code,
            "failureSummary": failure_summary,
            "impactedFiles": impacted_paths[:8],
            "logRef": None,
        })

    validation_suites = [s for s in suites if s["status"] != "skipped"]
    passed_count = len([s for s in validation_suites if s["status"] == "passed"])
    total_count = max(1, len(validation_suites))

    return {
        "suites": suites,
        "overallStatus": validation_report.get("overallStatus", "not_run"),
        "totalDurationMs": total_duration,
        "passRate": round(passed_count / total_count, 2) if total_count else 0,
    }


def build_quality_gates(validation_report: dict[str, Any], changed_files: list[dict[str, Any]], evaluation: dict[str, Any]) -> dict[str, Any]:
    gates = []
    commands = validation_report.get("commands", [])
    validation_commands = [c for c in commands if c.get("kind") == "validation"]

    gate_map = {
        "test": "test",
        "lint": "lint",
        "build": "build",
        "typecheck": "typecheck",
        "diff": "diff_check",
    }

    seen_gates = set()
    for cmd in validation_commands:
        command_str = cmd.get("command", "").lower()
        gate_type = "test"
        for keyword, gtype in gate_map.items():
            if keyword in command_str:
                gate_type = gtype
                break

        if gate_type in seen_gates:
            continue
        seen_gates.add(gate_type)

        exit_code = cmd.get("exitCode", -1)
        status = "passed" if exit_code == 0 else "failed"
        detail = cmd.get("command", "")
        gates.append({"gate": gate_type, "status": status, "detail": detail})

    for default_gate in ["lint", "test", "build"]:
        if default_gate not in seen_gates:
            gates.append({"gate": default_gate, "status": "not_run", "detail": None})

    all_passed = all(g["status"] in ("passed", "not_run", "skipped") for g in gates)
    any_failed = any(g["status"] == "failed" for g in gates)

    risk_level = evaluation.get("riskLevel", "medium")
    if any_failed or risk_level == "high":
        recommendation = "rework"
    elif not all_passed or risk_level == "medium":
        recommendation = "review"
    else:
        recommendation = "ship"

    return {"gates": gates, "allPassed": all_passed, "recommendation": recommendation}


def build_change_intent(
    issue: dict[str, Any],
    plan: dict[str, Any],
    changed_files: list[dict[str, Any]],
    critique_result: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    task_breakdown = []
    for task in (plan.get("tasks") or []):
        task_breakdown.append({
            "title": task.get("title", ""),
            "detail": task.get("detail", ""),
            "status": "done" if changed_files else "skipped",
            "acceptanceMet": bool(changed_files),
        })

    blast_radius = sorted(set(
        f["path"].rsplit("/", 1)[0] if "/" in f["path"] else "(root)"
        for f in changed_files
    ))

    hypothesis = critique_result.get("hypothesis", "") if critique_result else (plan.get("strategy") or "")
    self_critique = critique_result.get("selfCritique", "") if critique_result else ""
    evidence_sufficiency = critique_result.get("evidenceSufficiency", "moderate") if critique_result else "moderate"

    if not changed_files:
        evidence_sufficiency = "weak"

    return {
        "issueTitle": issue.get("title") or "",
        "issueNumber": issue.get("number"),
        "planSummary": plan.get("summary") or "",
        "hypothesis": hypothesis,
        "selfCritique": self_critique,
        "taskBreakdown": task_breakdown,
        "blastRadius": blast_radius,
        "evidenceSufficiency": evidence_sufficiency,
    }


def save_artifacts(
    run_id: str,
    patch_text: str,
    diff_stat: str,
    validation_report: dict[str, Any],
    pr_draft: dict[str, Any],
) -> dict[str, str]:
    directory = run_dir(run_id)
    directory.mkdir(parents=True, exist_ok=True)

    patch_path = directory / "patch.diff"
    validation_path = directory / "validation-report.json"
    pr_path = directory / "pr-draft.md"
    transcript_path = directory / "command-transcript.txt"
    diff_stat_path = directory / "diff-stat.txt"

    patch_path.write_text(patch_text, encoding="utf-8")
    validation_path.write_text(json.dumps(validation_report, indent=2), encoding="utf-8")
    pr_path.write_text(pr_draft.get("body", ""), encoding="utf-8")
    transcript_path.write_text(render_command_transcript(validation_report), encoding="utf-8")
    diff_stat_path.write_text(diff_stat, encoding="utf-8")

    return {
        "patchDiff": str(patch_path),
        "validationReport": str(validation_path),
        "prDraft": str(pr_path),
        "commandTranscript": str(transcript_path),
        "diffStat": str(diff_stat_path),
    }


def render_command_transcript(validation_report: dict[str, Any]) -> str:
    chunks = []
    for entry in validation_report.get("commands", []):
        chunks.append(
            "\n".join(
                [
                    f"$ {entry.get('command')}",
                    f"exit={entry.get('exitCode')} durationMs={entry.get('durationMs')}",
                    "--- stdout ---",
                    entry.get("stdout") or "",
                    "--- stderr ---",
                    entry.get("stderr") or "",
                ]
            )
        )
    return "\n\n".join(chunks)


def load_json_file(path: Path) -> Optional[dict[str, Any]]:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def read_text_safe(path: Path, limit: int) -> str:
    if not path.exists() or not path.is_file():
        return ""
    try:
        return path.read_text(encoding="utf-8")[:limit]
    except Exception:
        return ""


def truncate_text(value: str, limit: int) -> str:
    text = (value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def classify_failure(message: str) -> str:
    lower = message.lower()
    if "gemini" in lower or "api key" in lower:
        return "agent_failure"
    if "clone" in lower or "checkout" in lower or "sandbox" in lower:
        return "sandbox_setup_failure"
    if "validation" in lower or "test" in lower or "lint" in lower or "build" in lower:
        return "validation_failure"
    if "policy" in lower or "unsafe" in lower or "path" in lower:
        return "policy_violation"
    return "agent_failure"
