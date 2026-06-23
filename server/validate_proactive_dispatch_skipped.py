#!/usr/bin/env python3
"""Smoke: dispatch skipped responses stay stable (pass 35/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" in sys.modules:
        return
    fastapi = types.ModuleType("fastapi")
    fastapi.HTTPException = type("HTTPException", (Exception,), {})
    fastapi.APIRouter = lambda: types.SimpleNamespace(
        get=lambda *a, **k: (lambda fn: fn),
        post=lambda *a, **k: (lambda fn: fn),
    )
    sys.modules["fastapi"] = fastapi
    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {})
    pydantic.Field = lambda *a, **k: None
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_dispatch import (  # noqa: E402
    DISPATCH_SKIPPED_CODE,
    DISPATCH_SKIPPED_REASON,
    DISPATCH_SKIPPED_STATUS,
    build_dispatch_skipped_response,
)
from proactive_orchestrator import dispatch_daily  # noqa: E402
import proactive_store as store  # noqa: E402

REPO = "https://github.com/example/proactive-cron-smoke.git"
PROJECT = "cron-smoke"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _expected_keys() -> frozenset[str]:
    return frozenset(
        {
            "status",
            "reason",
            "code",
            "dispatchMode",
            "manualOnly",
            "config",
            "batch",
            "ready",
            "target",
            "candidates",
            "shortfallReason",
        }
    )


def main() -> int:
    config = store.default_config(REPO, PROJECT)
    config["enabled"] = False
    skipped = build_dispatch_skipped_response(config)
    _assert(set(skipped.keys()) == _expected_keys(), f"unexpected skipped keys: {sorted(skipped.keys())}")
    _assert(skipped["status"] == DISPATCH_SKIPPED_STATUS, "status drift")
    _assert(skipped["reason"] == DISPATCH_SKIPPED_REASON, "reason drift")
    _assert(skipped["code"] == DISPATCH_SKIPPED_CODE, "code drift")
    _assert(skipped["dispatchMode"] == "disabled", "dispatchMode drift")
    _assert(skipped["manualOnly"] is True, "manualOnly drift")
    _assert(skipped["batch"] is None, "batch must be null")
    _assert(skipped["ready"] == 0, "ready must be 0")
    _assert(skipped["candidates"] == [], "candidates must be empty")
    _assert(skipped["shortfallReason"] == DISPATCH_SKIPPED_REASON, "shortfallReason drift")

    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-skipped-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        store.update_config(REPO, PROJECT, {"enabled": False, "targetCount": 4})
        orchestrated = dispatch_daily(REPO, project_id=PROJECT)
        _assert(orchestrated == build_dispatch_skipped_response(store.get_config(REPO, PROJECT)), "dispatch_daily skipped mismatch")
        store.update_config(REPO, PROJECT, {"enabled": True})
        scopes = store.list_proactive_dispatch_scopes(enabled_only=True)
        _assert(len(scopes) == 1 and scopes[0].get("enabled") is True, "enabled scope listing failed")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)

    print("OK: proactive dispatch skipped validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
