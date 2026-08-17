"""
GitHub App/Webhook handler for auto-starting BugBot runs on issues
labeled with `neodevex`. Includes deduplication and concurrency controls.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import threading
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Request


BUGBOT_LABEL = os.getenv("BUGBOT_LABEL", "neodevex")
WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "").strip()


def create_webhook_router() -> APIRouter:
    router = APIRouter()

    @router.post("/webhooks/github")
    async def handle_github_webhook(request: Request):
        body = await request.body()
        signature = request.headers.get("X-Hub-Signature-256", "")

        if WEBHOOK_SECRET and not _verify_signature(body, signature, WEBHOOK_SECRET):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

        event_type = request.headers.get("X-GitHub-Event", "")
        delivery_id = request.headers.get("X-GitHub-Delivery", "")

        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON payload")

        if event_type == "issues" and payload.get("action") == "labeled":
            return _handle_issue_labeled(payload, delivery_id)
        elif event_type == "issues" and payload.get("action") == "edited":
            return _handle_issue_edited(payload, delivery_id)
        elif event_type == "ping":
            return {"status": "pong", "delivery": delivery_id}

        return {"status": "ignored", "event": event_type, "action": payload.get("action")}

    @router.get("/webhooks/health")
    def webhook_health():
        return {
            "status": "ok",
            "label": BUGBOT_LABEL,
            "secret_configured": bool(WEBHOOK_SECRET),
        }

    return router


def _verify_signature(body: bytes, signature: str, secret: str) -> bool:
    if not signature.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


def _handle_issue_labeled(payload: dict[str, Any], delivery_id: str) -> dict[str, Any]:
    """Handle issues.labeled event — auto-start run if label is neodevex."""
    label = payload.get("label", {}).get("name", "")
    if label.lower() != BUGBOT_LABEL.lower():
        return {"status": "ignored", "reason": f"Label '{label}' is not '{BUGBOT_LABEL}'"}

    issue = payload.get("issue", {})
    repo = payload.get("repository", {})

    issue_url = issue.get("html_url", "")
    repo_url = repo.get("html_url", "")
    repo_name = repo.get("full_name", repo.get("name", "unknown"))

    if not issue_url or not repo_url:
        return {"status": "error", "reason": "Missing issue or repo URL in payload"}

    # Deduplication check
    from bugbot_orchestrator import has_active_run_for_issue, is_bugbot_at_capacity

    if has_active_run_for_issue(issue_url):
        return {
            "status": "skipped",
            "reason": "Active run already exists for this issue",
            "issue_url": issue_url,
        }

    if is_bugbot_at_capacity():
        return {
            "status": "queued_later",
            "reason": "BugBot at concurrency limit",
            "issue_url": issue_url,
        }

    # Create and enqueue the run
    run = _create_bugbot_run(
        repo_url=repo_url,
        repo_name=repo_name,
        issue_url=issue_url,
        issue_data=issue,
        delivery_id=delivery_id,
    )

    # Start execution in background
    github_token = os.getenv("GITHUB_TOKEN", "").strip() or None
    threading.Thread(
        target=_execute_bugbot_run,
        args=(run["id"], github_token),
        daemon=True,
        name=f"bugbot-{run['id'][:8]}",
    ).start()

    return {
        "status": "started",
        "run_id": run["id"],
        "issue_url": issue_url,
        "delivery": delivery_id,
    }


def _handle_issue_edited(payload: dict[str, Any], delivery_id: str) -> dict[str, Any]:
    """Handle issues.edited — optionally re-trigger if reproduction details updated."""
    issue = payload.get("issue", {})
    labels = [l.get("name", "") for l in issue.get("labels", [])]

    if BUGBOT_LABEL.lower() not in [l.lower() for l in labels]:
        return {"status": "ignored", "reason": f"Issue not labeled '{BUGBOT_LABEL}'"}

    changes = payload.get("changes", {})
    if "body" not in changes:
        return {"status": "ignored", "reason": "Only body edits trigger re-analysis"}

    issue_url = issue.get("html_url", "")
    repo = payload.get("repository", {})

    from bugbot_orchestrator import has_active_run_for_issue
    if has_active_run_for_issue(issue_url):
        return {"status": "skipped", "reason": "Active run exists; will not re-trigger"}

    return {
        "status": "noted",
        "reason": "Issue body was updated; manual re-trigger recommended",
        "issue_url": issue_url,
    }


def _create_bugbot_run(
    repo_url: str,
    repo_name: str,
    issue_url: str,
    issue_data: dict[str, Any],
    delivery_id: str,
) -> dict[str, Any]:
    """Create an AgentRun record for a BugBot-triggered fix."""
    from agent_runs import (
        build_branch_name,
        now_iso,
        write_run,
        append_timeline,
    )

    run_id = uuid.uuid4().hex
    created_at = now_iso()

    issue = {
        "owner": repo_url.rstrip("/").split("/")[-2] if "/" in repo_url else "",
        "repo": repo_url.rstrip("/").split("/")[-1] if "/" in repo_url else repo_name,
        "number": issue_data.get("number", 0),
        "title": issue_data.get("title", ""),
        "body": (issue_data.get("body") or "")[:4000],
        "state": issue_data.get("state"),
        "labels": [l.get("name", "") for l in issue_data.get("labels", [])],
        "author": issue_data.get("user", {}).get("login"),
        "htmlUrl": issue_data.get("html_url") or issue_url,
        "comments": [],
    }

    run = {
        "id": run_id,
        "status": "queued",
        "createdAt": created_at,
        "updatedAt": created_at,
        "startedAt": None,
        "completedAt": None,
        "projectId": None,
        "repoUrl": repo_url,
        "repoName": repo_name,
        "issueUrl": issue_url,
        "branch": None,
        "issue": issue,
        "contextHints": None,
        "plan": None,
        "timeline": [],
        "policy": {
            "commandAllowlist": [
                "git clone", "git checkout", "git diff",
                "npm install", "npm test", "npm run lint", "npm run build",
                "python -m pytest", "pip install",
            ],
            "pathDenylist": [
                ".git/**", ".env*", "node_modules/**",
                "dist/**", "build/**", "*.pem", "*.key",
            ],
            "networkPolicy": "default-open for clone/install",
        },
        "control": {"cancelRequested": False},
        "artifacts": {
            "workspacePath": None,
            "patch": "",
            "diffStat": "",
            "changedFiles": [],
            "validation": {"overallStatus": "not_run", "commands": []},
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
            "branchName": build_branch_name(issue, repo_name),
            "instructions": [],
            "approvedAt": None,
            "rejectedAt": None,
            "prUrl": None,
            "commitSha": None,
            "promotionLog": [],
        },
        "trigger": {
            "source": "github_webhook",
            "label": BUGBOT_LABEL,
            "delivery_id": delivery_id,
        },
    }

    write_run(run)
    append_timeline(run_id, "queued", "BugBot run queued",
                   f"Auto-triggered by '{BUGBOT_LABEL}' label on issue #{issue['number']}")

    return run


def _execute_bugbot_run(run_id: str, github_token: Optional[str]) -> None:
    """Background execution of a BugBot-triggered run using the orchestrator."""
    try:
        from bugbot_orchestrator import BugBotOrchestrator
        orchestrator = BugBotOrchestrator(run_id, github_token)
        orchestrator.execute()
    except Exception as exc:
        from agent_runs import append_timeline, read_run, write_run, now_iso
        run = read_run(run_id)
        if run:
            run["status"] = "failed"
            run["updatedAt"] = now_iso()
            run["completedAt"] = now_iso()
            run["artifacts"]["failureCategory"] = "bugbot_pipeline_failure"
            write_run(run)
            append_timeline(run_id, "failed", "BugBot pipeline crashed", str(exc), level="error")
