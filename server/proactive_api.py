from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from proactive_api_errors import enforce_cron_token, validate_repo_url_param
from proactive_config import ProactiveConfigValidationError, validate_config_patch, validate_optional_target_count
from proactive_context_hints import normalize_proactive_context_hints
from proactive_orchestrator import dispatch_daily
from proactive_store import (
    enrich_candidate,
    enrich_candidates,
    find_candidate,
    list_candidates,
    get_config as store_get_config,
    summarize_status,
    update_batch,
    update_candidate,
    update_config as store_update_config,
    now_iso,
)


def _repo_url_query(repoUrl: str) -> str:
    return validate_repo_url_param(repoUrl)


RepoUrlQuery = Annotated[str, Depends(_repo_url_query)]


class ProactiveScope(BaseModel):
    repoUrl: str
    projectId: Optional[str] = None


class ProactiveConfigUpdate(ProactiveScope):
    enabled: Optional[bool] = None
    targetCount: Optional[int] = None
    qualityMode: Optional[str] = None
    timezone: Optional[str] = None
    morningDeadline: Optional[str] = None


class ProactiveDispatchRequest(ProactiveScope):
    repoName: Optional[str] = None
    contextHints: Optional[dict[str, Any]] = None
    targetCount: Optional[int] = None
    githubToken: Optional[str] = None


class ProactiveApproveRequest(BaseModel):
    branchName: Optional[str] = None


class ProactiveDismissRequest(BaseModel):
    reason: Optional[str] = None


def _config_validation_error(exc: ProactiveConfigValidationError) -> HTTPException:
    from proactive_api_errors import structured_detail

    return HTTPException(
        status_code=400,
        detail=structured_detail(str(exc), code="invalid_config"),
    )


def create_proactive_router() -> APIRouter:
    router = APIRouter()

    @router.get("/proactive/config")
    def get_proactive_config(repoUrl: RepoUrlQuery, projectId: Optional[str] = None):
        return {"config": store_get_config(repoUrl, projectId)}

    @router.post("/proactive/config")
    def update_proactive_config(request: ProactiveConfigUpdate):
        repo_url = validate_repo_url_param(request.repoUrl)
        try:
            patch = validate_config_patch(
                request.model_dump(exclude={"repoUrl", "projectId"}, exclude_none=True),
            )
        except ProactiveConfigValidationError as exc:
            raise _config_validation_error(exc) from exc
        return {
            "config": store_update_config(
                repo_url,
                request.projectId,
                patch,
            )
        }

    @router.get("/proactive/status")
    def get_status(repoUrl: RepoUrlQuery, projectId: Optional[str] = None):
        from proactive_failure_recovery import safe_build_status_summary

        return safe_build_status_summary(repoUrl, projectId)

    @router.get("/proactive/candidates")
    def get_candidates(
        repoUrl: RepoUrlQuery,
        projectId: Optional[str] = None,
        batchId: Optional[str] = None,
        includeDismissed: bool = False,
    ):
        from proactive_failure_recovery import safe_enrich_candidates

        return {
            "candidates": safe_enrich_candidates(
                list_candidates(repoUrl, projectId, batchId, include_dismissed=includeDismissed)
            )
        }

    @router.get("/proactive/candidates/{candidate_id}")
    def get_candidate(candidate_id: str):
        candidate = find_candidate(candidate_id)
        if not candidate:
            from proactive_api_errors import raise_api_error

            raise_api_error(404, "Candidate not found", "candidate_not_found")
        from proactive_failure_recovery import safe_enrich_candidate

        return {"candidate": safe_enrich_candidate(candidate)}

    @router.post("/proactive/dispatch-daily")
    def dispatch(request: ProactiveDispatchRequest, authorization: Optional[str] = Header(default=None)):
        enforce_cron_token(authorization)
        repo_url = validate_repo_url_param(request.repoUrl)
        try:
            target_count = validate_optional_target_count(request.targetCount)
        except ProactiveConfigValidationError as exc:
            raise _config_validation_error(exc) from exc
        from proactive_secret_sanitizer import normalize_github_token

        github_token = normalize_github_token(request.githubToken)
        return dispatch_daily(
            repo_url,
            repo_name=request.repoName,
            project_id=request.projectId,
            context_hints=normalize_proactive_context_hints(request.contextHints),
            target_count=target_count,
            github_token=github_token,
        )

    @router.post("/proactive/candidates/{candidate_id}/approve")
    def approve_candidate(candidate_id: str, request: ProactiveApproveRequest):
        from proactive_approval import approve_proactive_candidate

        candidate = find_candidate(candidate_id)
        if not candidate:
            from proactive_api_errors import raise_api_error

            raise_api_error(404, "Candidate not found", "candidate_not_found")
        return approve_proactive_candidate(candidate, branch_name=request.branchName)

    @router.post("/proactive/candidates/{candidate_id}/dismiss")
    def dismiss_candidate(candidate_id: str, request: ProactiveDismissRequest):
        from proactive_dismiss import dismiss_proactive_candidate

        candidate = find_candidate(candidate_id)
        if not candidate:
            from proactive_api_errors import raise_api_error

            raise_api_error(404, "Candidate not found", "candidate_not_found")
        if candidate.get("status") == "dismissed":
            from proactive_api_errors import raise_api_error

            raise_api_error(409, "Candidate is already dismissed.", "candidate_already_dismissed")
        return dismiss_proactive_candidate(candidate, reason=request.reason)

    return router
