from __future__ import annotations

import os
import re
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from proactive_store import normalize_repo_url

_GITHUB_HTTPS_RE = re.compile(r"^https://github\.com/[^/]+/[^/]+/?$", re.IGNORECASE)
_LOCAL_PREFIX = "local://"


class ProactiveApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        *,
        code: str,
        field: Optional[str] = None,
        hint: Optional[str] = None,
    ) -> None:
        self.status_code = status_code
        self.message = message
        self.code = code
        self.field = field
        self.hint = hint
        super().__init__(message)


def structured_detail(
    message: str,
    *,
    code: str,
    field: Optional[str] = None,
    hint: Optional[str] = None,
    errors: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"message": message, "code": code}
    if field:
        payload["field"] = field
    if hint:
        payload["hint"] = hint
    if errors:
        payload["errors"] = errors
    return payload


def validate_repo_url_param(repo_url: Optional[str], *, field: str = "repoUrl") -> str:
    raw = (repo_url or "").strip()
    if not raw:
        raise ProactiveApiError(
            400,
            "repoUrl is required",
            code="missing_repo_url",
            field=field,
        )

    if raw.startswith(_LOCAL_PREFIX):
        name = raw[len(_LOCAL_PREFIX) :].strip()
        if not name:
            raise ProactiveApiError(
                400,
                "local:// repo URLs must include a workspace name",
                code="invalid_repo_url",
                field=field,
            )
        return normalize_repo_url(raw)

    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ProactiveApiError(
            400,
            "repoUrl must use http, https, or local://",
            code="invalid_repo_url",
            field=field,
        )
    if not parsed.netloc:
        raise ProactiveApiError(
            400,
            "repoUrl must include a host",
            code="invalid_repo_url",
            field=field,
        )
    if parsed.scheme == "https" and "github.com" in (parsed.netloc or "").lower():
        if not _GITHUB_HTTPS_RE.match(normalize_repo_url(raw)):
            raise ProactiveApiError(
                400,
                "repoUrl must be a github.com repository URL (https://github.com/owner/repo)",
                code="invalid_github_repo_url",
                field=field,
            )
    return normalize_repo_url(raw)


def raise_api_error(
    status_code: int,
    message: str,
    code: str,
    *,
    field: Optional[str] = None,
    hint: Optional[str] = None,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=structured_detail(message, code=code, field=field, hint=hint),
    )


def enforce_cron_token(authorization: Optional[str]) -> None:
    expected = os.getenv("PROACTIVE_CRON_TOKEN", "").strip()
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise_api_error(
            401,
            "Invalid proactive cron token",
            "invalid_cron_token",
            hint="Send Authorization: Bearer <PROACTIVE_CRON_TOKEN> on dispatch-daily when the token is configured.",
        )


def coerce_exception_detail(detail: Any, status_code: int) -> dict[str, Any]:
    from proactive_secret_sanitizer import redact_secrets

    if isinstance(detail, dict) and isinstance(detail.get("message"), str):
        payload = dict(detail)
        payload["message"] = redact_secrets(str(payload["message"]))
        if isinstance(payload.get("hint"), str):
            payload["hint"] = redact_secrets(str(payload["hint"]))
        return payload
    if isinstance(detail, list):
        errors = []
        for item in detail:
            if not isinstance(item, dict):
                continue
            loc = item.get("loc") or []
            field = ".".join(str(part) for part in loc if part != "body")
            errors.append(
                {
                    "field": field or None,
                    "message": redact_secrets(str(item.get("msg") or "Invalid value")),
                    "type": str(item.get("type") or "validation_error"),
                }
            )
        message = errors[0]["message"] if errors else "Request validation failed"
        field = errors[0].get("field") if errors else None
        return structured_detail(
            message,
            code="validation_error",
            field=field,
            errors=errors or None,
        )
    if isinstance(detail, str) and detail.strip():
        code = "invalid_cron_token" if status_code == 401 else "request_error"
        return structured_detail(redact_secrets(detail.strip()), code=code)
    return structured_detail("Request failed", code="request_error")


def _is_proactive_path(request: Request) -> bool:
    return request.url.path.startswith("/api/proactive")


async def proactive_http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if not _is_proactive_path(request):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": coerce_exception_detail(exc.detail, exc.status_code)},
    )


async def proactive_request_validation_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    if not _is_proactive_path(request):
        return JSONResponse(status_code=422, content={"detail": exc.errors()})
    return JSONResponse(
        status_code=422,
        content={"detail": coerce_exception_detail(exc.errors(), 422)},
    )


async def proactive_api_error_handler(request: Request, exc: ProactiveApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": structured_detail(
                exc.message,
                code=exc.code,
                field=exc.field,
                hint=exc.hint,
            )
        },
    )


def register_proactive_exception_handlers(app: Any) -> None:
    app.add_exception_handler(ProactiveApiError, proactive_api_error_handler)
    app.add_exception_handler(HTTPException, proactive_http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, proactive_http_exception_handler)
    app.add_exception_handler(RequestValidationError, proactive_request_validation_handler)
