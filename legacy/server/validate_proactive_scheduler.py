#!/usr/bin/env python3
"""Smoke: proactive scheduler ticks enabled scopes and survives per-scope failures."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import threading
import types
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
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

import proactive_scheduler as scheduler  # noqa: E402
import proactive_store as store  # noqa: E402

REPO_A = "https://github.com/example/proactive-scheduler-smoke-a.git"
REPO_B = "https://github.com/example/proactive-scheduler-smoke-b.git"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-scheduler-smoke-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        store.update_config(REPO_A, "smoke-a", {"enabled": True})
        store.update_config(REPO_B, "smoke-b", {"enabled": False})

        calls: list[str] = []

        def fake_dispatch_daily(repo_url: str, project_id=None, **_kwargs):
            calls.append(repo_url)
            return {"status": "complete"}

        with patch("proactive_orchestrator.dispatch_daily", side_effect=fake_dispatch_daily):
            results = scheduler.run_scheduler_tick()
        _assert(calls == [REPO_A], f"expected only enabled scope dispatched, got {calls}")
        _assert(len(results) == 1 and results[0]["status"] == "complete", "tick result shape drift")

        def flaky_dispatch(repo_url: str, project_id=None, **_kwargs):
            raise RuntimeError("simulated failure")

        store.update_config(REPO_B, "smoke-b", {"enabled": True})
        with patch("proactive_orchestrator.dispatch_daily", side_effect=flaky_dispatch):
            results = scheduler.run_scheduler_tick()
        _assert(len(results) == 2, "tick must report a result per enabled scope even on failure")
        _assert(all(item["status"] == "error" for item in results), "failed scopes must report status=error")

        done = threading.Event()
        seen: dict[str, object] = {}

        def single_dispatch(repo_url: str, repo_name=None, project_id=None, **_kwargs):
            seen["repo_url"] = repo_url
            seen["project_id"] = project_id
            done.set()
            return {"status": "complete"}

        with patch("proactive_orchestrator.dispatch_daily", side_effect=single_dispatch):
            scheduler.schedule_proactive_dispatch(REPO_A, project_id="smoke-a")
            _assert(done.wait(timeout=5), "schedule_proactive_dispatch did not fire within timeout")
        _assert(seen["repo_url"] == REPO_A, "schedule_proactive_dispatch passed wrong repoUrl")
        _assert(seen["project_id"] == "smoke-a", "schedule_proactive_dispatch passed wrong projectId")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)

    print("OK: proactive scheduler validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
