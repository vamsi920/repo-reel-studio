#!/usr/bin/env python3
"""Proactive API auth, repoUrl validation, structured errors (pass 17/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any, Optional
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    fastapi = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: Any = None):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    class Request:  # noqa: D106
        def __init__(self, path: str = ""):
            self.url = types.SimpleNamespace(path=path)

    class FastAPI:
        def __init__(self, **_kwargs: Any):
            self.router = types.SimpleNamespace(routes=[])

        def add_exception_handler(self, *_args: Any, **_kwargs: Any) -> None:
            return None

        def include_router(self, *_args: Any, **_kwargs: Any) -> None:
            return None

    fastapi.HTTPException = HTTPException
    fastapi.Request = Request
    fastapi.FastAPI = FastAPI
    fastapi.Depends = lambda dependency: dependency
    fastapi.APIRouter = lambda: types.SimpleNamespace(
        get=lambda *args, **kwargs: (lambda fn: fn),
        post=lambda *args, **kwargs: (lambda fn: fn),
    )
    fastapi.Header = lambda *args, **kwargs: None

    exceptions = types.ModuleType("fastapi.exceptions")

    class RequestValidationError(Exception):
        def __init__(self, errors: list[dict[str, Any]]):
            super().__init__(errors)
            self._errors = errors

        def errors(self) -> list[dict[str, Any]]:
            return self._errors

    exceptions.RequestValidationError = RequestValidationError

    responses = types.ModuleType("fastapi.responses")

    class JSONResponse:
        def __init__(self, status_code: int, content: dict[str, Any]):
            self.status_code = status_code
            self.content = content

    responses.JSONResponse = JSONResponse

    testclient = types.ModuleType("fastapi.testclient")

    class TestClient:  # pragma: no cover - only when real fastapi installed
        def __init__(self, *_args: Any, **_kwargs: Any):
            raise ImportError("fastapi is not installed")

    testclient.TestClient = TestClient

    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {"model_dump": lambda self, **kwargs: self.__dict__})

    starlette = types.ModuleType("starlette.exceptions")
    starlette.HTTPException = HTTPException

    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.exceptions"] = exceptions
    sys.modules["fastapi.responses"] = responses
    sys.modules["fastapi.testclient"] = testclient
    sys.modules["pydantic"] = pydantic
    sys.modules["starlette.exceptions"] = starlette


try:
    from fastapi import FastAPI  # noqa: F401
    from fastapi.testclient import TestClient  # noqa: F401

    HAVE_FASTAPI = True
except ImportError:
    _install_import_stubs()
    HAVE_FASTAPI = False

from fastapi import HTTPException  # noqa: E402

from proactive_api_errors import (  # noqa: E402
    ProactiveApiError,
    coerce_exception_detail,
    enforce_cron_token,
    structured_detail,
    validate_repo_url_param,
)

REPO = "https://github.com/example/proactive-api.git"
TEST_CRON = "unit-test-cron-secret"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _detail(payload: dict[str, Any]) -> dict[str, Any]:
    detail = payload.get("detail")
    _assert(isinstance(detail, dict), "detail must be a structured object")
    return detail


def _expect_proactive_error(callable_obj, *, code: str) -> None:
    try:
        callable_obj()
    except ProactiveApiError as exc:
        _assert(exc.code == code, f"expected code {code}, got {exc.code}")
        return
    _fail(f"expected ProactiveApiError code={code}")


def _expect_http_error(callable_obj, *, status_code: int, code: str) -> None:
    try:
        callable_obj()
    except HTTPException as exc:
        _assert(exc.status_code == status_code, f"expected status {status_code}, got {exc.status_code}")
        body = coerce_exception_detail(exc.detail, exc.status_code)
        _assert(body.get("code") == code, f"expected code {code}, got {body.get('code')}")
        return
    _fail(f"expected HTTPException status={status_code} code={code}")


def _test_repo_url_validation() -> None:
    _expect_proactive_error(lambda: validate_repo_url_param("   "), code="missing_repo_url")
    _expect_proactive_error(
        lambda: validate_repo_url_param("ftp://example.com/a"),
        code="invalid_repo_url",
    )
    _expect_proactive_error(
        lambda: validate_repo_url_param("https://github.com/only-owner"),
        code="invalid_github_repo_url",
    )
    _expect_proactive_error(lambda: validate_repo_url_param("local://"), code="invalid_repo_url")
    normalized = validate_repo_url_param(REPO)
    _assert(normalized == REPO, "github repo should normalize unchanged")
    _assert(
        validate_repo_url_param("local://fixture") == "local://fixture",
        "local repo should normalize",
    )


def _test_cron_auth() -> None:
    prior = os.environ.get("PROACTIVE_CRON_TOKEN")
    try:
        os.environ["PROACTIVE_CRON_TOKEN"] = TEST_CRON
        _expect_http_error(lambda: enforce_cron_token(None), status_code=401, code="invalid_cron_token")
        _expect_http_error(
            lambda: enforce_cron_token("Bearer wrong"),
            status_code=401,
            code="invalid_cron_token",
        )
        enforce_cron_token(f"Bearer {TEST_CRON}")
        os.environ.pop("PROACTIVE_CRON_TOKEN", None)
        enforce_cron_token(None)
    finally:
        if prior is None:
            os.environ.pop("PROACTIVE_CRON_TOKEN", None)
        else:
            os.environ["PROACTIVE_CRON_TOKEN"] = prior


def _test_structured_errors() -> None:
    coerced = coerce_exception_detail("repoUrl is required", 400)
    _assert(coerced.get("code") == "request_error", "string detail code")
    _assert(coerced.get("message") == "repoUrl is required", "string detail message")
    validation = coerce_exception_detail(
        [{"loc": ["query", "repoUrl"], "msg": "Field required", "type": "missing"}],
        422,
    )
    _assert(validation.get("code") == "validation_error", "validation detail code")
    _assert(isinstance(validation.get("errors"), list), "validation detail errors")
    preserved = coerce_exception_detail(
        structured_detail("Invalid config", code="invalid_config"),
        400,
    )
    _assert(preserved.get("code") == "invalid_config", "structured detail preserved")


def _test_routes_with_test_client(tmp_root: Path) -> None:
    if not HAVE_FASTAPI:
        print("SKIP: FastAPI TestClient routes (fastapi not installed)")
        return

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from proactive_api import create_proactive_router
    from proactive_api_errors import register_proactive_exception_handlers

    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    app = FastAPI()
    register_proactive_exception_handlers(app)
    app.include_router(create_proactive_router(), prefix="/api")
    client = TestClient(app)

    missing = client.get("/api/proactive/status")
    _assert(missing.status_code == 422, "missing repoUrl should 422")
    _assert(_detail(missing.json()).get("code") == "validation_error", "missing repoUrl code")

    empty = client.get("/api/proactive/status", params={"repoUrl": "   "})
    _assert(empty.status_code == 400, "blank repoUrl should 400")
    _assert(_detail(empty.json()).get("code") == "missing_repo_url", "blank repoUrl code")

    ok = client.get("/api/proactive/status", params={"repoUrl": REPO})
    _assert(ok.status_code == 200, "valid repoUrl should 200")

    os.environ["PROACTIVE_CRON_TOKEN"] = TEST_CRON
    client = TestClient(app)
    _assert(
        client.post("/api/proactive/dispatch-daily", json={"repoUrl": REPO}).status_code == 401,
        "dispatch without bearer should 401 when token set",
    )

    stub_payload = {
        "config": {},
        "batch": None,
        "ready": 0,
        "target": 6,
        "candidates": [],
        "shortfallReason": None,
        "status": "skipped",
        "reason": "test",
    }

    with patch("proactive_api.dispatch_daily", return_value=stub_payload):
        authorized = client.post(
            "/api/proactive/dispatch-daily",
            json={"repoUrl": REPO},
            headers={"Authorization": f"Bearer {TEST_CRON}"},
        )
    _assert(authorized.status_code == 200, "dispatch with valid bearer should 200")

    not_found = client.get("/api/proactive/candidates/does-not-exist")
    _assert(not_found.status_code == 404, "unknown candidate should 404")
    _assert(_detail(not_found.json()).get("code") == "candidate_not_found", "candidate not found code")


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-api-"))
    try:
        _test_repo_url_validation()
        _test_cron_auth()
        _test_structured_errors()
        _test_routes_with_test_client(tmp_root)
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)

    print("OK: proactive API errors and auth")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
