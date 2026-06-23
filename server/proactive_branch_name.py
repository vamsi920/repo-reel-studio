from __future__ import annotations

import re
from typing import Any, Optional

PROACTIVE_ISSUE_PREFIX = "proactive://"
BRANCH_PREFIX = "gitflick/proactive"


def sanitize_branch_name(value: str) -> str:
    return re.sub(r"[^a-z0-9._/-]+", "-", (value or "").lower()).strip("-/")[:64] or "gitflick/agent-run"


def slugify_branch_component(value: str, *, max_len: int = 32) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:max_len] or "repo"


def is_proactive_issue(issue: Optional[dict[str, Any]]) -> bool:
    url = str((issue or {}).get("htmlUrl") or "").strip().lower()
    return url.startswith(PROACTIVE_ISSUE_PREFIX)


def proactive_issue_candidate_id(issue: Optional[dict[str, Any]]) -> Optional[str]:
    if not is_proactive_issue(issue):
        return None
    url = str(issue.get("htmlUrl") or "").strip()
    marker = f"{PROACTIVE_ISSUE_PREFIX}candidate/"
    if marker not in url:
        return None
    tail = url.split(marker, 1)[1].strip("/")
    return tail or None


def short_id(value: Optional[str], *, length: int = 8) -> str:
    token = re.sub(r"[^a-z0-9]", "", str(value or "").lower())
    return token[:length] or "00000000"


def build_proactive_branch_name(
    *,
    candidate_id: str,
    run_id: str,
    repo_name: str,
    title: Optional[str] = None,
    candidate_type: Optional[str] = None,
) -> str:
    repo_slug = slugify_branch_component(repo_name, max_len=22)
    title_slug = slugify_branch_component(title or candidate_type or "candidate", max_len=20)
    raw = (
        f"{BRANCH_PREFIX}-{repo_slug}-"
        f"c{short_id(candidate_id)}-"
        f"r{short_id(run_id)}-"
        f"{title_slug}"
    )
    return sanitize_branch_name(raw)


def build_proactive_branch_name_from_run(run: dict[str, Any]) -> str:
    proactive = run.get("proactive") if isinstance(run.get("proactive"), dict) else {}
    candidate_id = str(proactive.get("candidateId") or "").strip()
    run_id = str(run.get("id") or "").strip()
    if not candidate_id:
        extracted = proactive_issue_candidate_id(run.get("issue"))
        candidate_id = extracted or ""
    issue = run.get("issue") if isinstance(run.get("issue"), dict) else {}
    title = str(issue.get("title") or run.get("repoName") or "proactive").strip()
    labels = issue.get("labels") or []
    candidate_type = labels[0] if isinstance(labels, list) and labels else None
    if not candidate_id or not run_id:
        repo_name = str(run.get("repoName") or "repo")
        return sanitize_branch_name(f"{BRANCH_PREFIX}-{slugify_branch_component(repo_name)}")
    return build_proactive_branch_name(
        candidate_id=candidate_id,
        run_id=run_id,
        repo_name=str(run.get("repoName") or "repo"),
        title=title,
        candidate_type=str(candidate_type) if candidate_type else None,
    )


def build_branch_name_for_run(run: dict[str, Any]) -> str:
    proactive = run.get("proactive")
    if isinstance(proactive, dict) and proactive.get("candidateId"):
        return build_proactive_branch_name_from_run(run)
    if is_proactive_issue(run.get("issue")):
        return build_proactive_branch_name_from_run(run)
    from agent_runs import build_branch_name

    return build_branch_name(run.get("issue"), str(run.get("repoName") or ""))


def resolve_approval_branch_name(run: dict[str, Any], manual_branch: Optional[str] = None) -> str:
    if manual_branch and str(manual_branch).strip():
        return sanitize_branch_name(str(manual_branch).strip())
    existing = str((run.get("approval") or {}).get("branchName") or "").strip()
    if existing:
        return sanitize_branch_name(existing)
    return build_branch_name_for_run(run)
