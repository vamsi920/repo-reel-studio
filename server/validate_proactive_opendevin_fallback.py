#!/usr/bin/env python3
"""OpenDevin fallback + proactive executor outcome checks (pass 19/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any, Optional
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" in sys.modules:
        return

    fastapi = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    fastapi.HTTPException = HTTPException
    fastapi.APIRouter = lambda: types.SimpleNamespace(get=lambda *a, **k: (lambda fn: fn), post=lambda *a, **k: (lambda fn: fn))
    sys.modules["fastapi"] = fastapi
    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {"model_dump": lambda self, **kwargs: self.__dict__})
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from opendevin_fallback import (  # noqa: E402
    EXECUTOR_MODE_LEGACY,
    EXECUTOR_MODE_UNAVAILABLE,
    classify_proactive_executor_result,
    describe_opendevin_availability,
    try_legacy_executor,
    unavailable_reason,
)
from opendevin_runner import OpenDevinConfig, OpenDevinResult, OpenDevinRunner  # noqa: E402
from proactive_no_patch_failure import FAILURE_KIND_EXECUTION_ERROR, FAILURE_KIND_NO_PATCH  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _result(*, patch: str = "", error: str = "", mode: str = "opendevin") -> OpenDevinResult:
    item = OpenDevinResult()
    item.patch = patch
    item.error = error or None
    item.executor_mode = mode
    item.success = bool(patch.strip())
    return item


def main() -> int:
    availability = describe_opendevin_availability()
    _assert("channels" in availability, "availability should list channels")
    _assert("legacy_enabled" in availability, "availability should expose legacy flag")

    patch_outcome = classify_proactive_executor_result(_result(patch="diff --git a"))
    _assert(patch_outcome["has_patch"], "patch outcome should mark has_patch")
    _assert(patch_outcome["executor_source"] == "opendevin", "patch source should follow executor mode")

    unavailable_outcome = classify_proactive_executor_result(
        _result(error="OpenDevin unavailable", mode=EXECUTOR_MODE_UNAVAILABLE),
    )
    _assert(not unavailable_outcome["has_patch"], "unavailable should not claim patch")
    _assert(
        unavailable_outcome["failure_kind"] == FAILURE_KIND_EXECUTION_ERROR,
        "unavailable should map to execution_error",
    )
    _assert(
        unavailable_outcome["executor_source"] == "opendevin_unavailable",
        "unavailable executor source",
    )

    legacy_outcome = classify_proactive_executor_result(
        _result(error="Legacy executor completed without producing a patch.", mode=EXECUTOR_MODE_LEGACY),
    )
    _assert(legacy_outcome["failure_kind"] == FAILURE_KIND_NO_PATCH, "legacy no patch kind")
    _assert(legacy_outcome["executor_source"] == "legacy", "legacy source")

    reason = unavailable_reason(availability={"channels": []}, legacy_error="legacy blocked")
    _assert("OpenDevin is unavailable" in reason, "unavailable reason mentions OpenDevin")
    _assert("legacy blocked" in reason, "unavailable reason mentions legacy")

    tmp_workspace = Path(tempfile.mkdtemp(prefix="proactive-od-fallback-"))
    try:
        os.environ.pop("OPENDEVIN_API_URL", None)
        os.environ.pop("OPENDEVIN_PATH", None)
        os.environ["PROACTIVE_DISABLE_LEGACY_EXECUTOR"] = "1"

        config = OpenDevinConfig(workspace_path=str(tmp_workspace))
        runner = OpenDevinRunner(config)
        issue = {"number": 1, "title": "Test", "body": "Body"}
        output = runner._execute_fallback(
            "task",
            issue=issue,
            context_hints={},
            attempts=[],
            last_error="api down",
        )
        _assert(output.get("unavailable"), "fallback without legacy should mark unavailable")
        _assert(output.get("error"), "fallback should include explicit error")
        _assert(output.get("exit_code") != 0, "fallback must not silently succeed")

        disabled = try_legacy_executor(tmp_workspace, {"number": 1, "title": "Test", "body": "Body"})
        _assert(disabled.executor_mode == EXECUTOR_MODE_UNAVAILABLE, "disabled legacy mode")
        _assert(disabled.error, "disabled legacy should set error")
        _assert(not disabled.success, "disabled legacy must not succeed silently")

        os.environ.pop("PROACTIVE_DISABLE_LEGACY_EXECUTOR", None)
        legacy = OpenDevinResult()
        legacy.patch = "diff --git a/foo\n"
        legacy.changed_files = [{"path": "foo", "additions": 1, "deletions": 0, "changedLines": 1}]
        legacy.success = True
        with patch("opendevin_fallback.try_legacy_executor", return_value=legacy):
            ok_output = runner._execute_fallback(
                "task",
                issue=issue,
                context_hints={},
                attempts=[],
            )
        _assert(ok_output.get("legacy"), "legacy patch should return legacy flag")
        _assert(runner.result.patch.strip(), "runner should retain legacy patch")
        _assert(not ok_output.get("unavailable"), "legacy success should not be unavailable")

        empty_legacy = OpenDevinResult()
        empty_legacy.error = "Legacy executor completed without producing a patch."
        with patch("opendevin_fallback.try_legacy_executor", return_value=empty_legacy):
            blocked = runner._execute_fallback("task", issue=issue, context_hints={}, attempts=[])
        _assert(blocked.get("unavailable"), "empty legacy should surface unavailable")
        _assert("Legacy executor" in (blocked.get("error") or ""), "error should mention legacy outcome")

    finally:
        shutil.rmtree(tmp_workspace, ignore_errors=True)
        os.environ.pop("PROACTIVE_DISABLE_LEGACY_EXECUTOR", None)

    print("OK: proactive OpenDevin fallback")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
