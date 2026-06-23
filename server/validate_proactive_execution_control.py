#!/usr/bin/env python3
"""Cancellation/timeout checks for proactive execution (pass 11/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Optional

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" not in sys.modules:
        fastapi = types.ModuleType("fastapi")

        class HTTPException(Exception):
            def __init__(self, status_code: int = 500, detail: str = ""):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail

        class APIRouter:
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                pass

            def get(self, *args: Any, **kwargs: Any):
                def decorator(func):
                    return func

                return decorator

            def post(self, *args: Any, **kwargs: Any):
                return self.get(*args, **kwargs)

        fastapi.HTTPException = HTTPException
        fastapi.APIRouter = APIRouter
        sys.modules["fastapi"] = fastapi

    if "pydantic" not in sys.modules:
        pydantic = types.ModuleType("pydantic")

        class BaseModel:
            def model_dump(self) -> dict[str, Any]:
                return dict(self.__dict__)

        pydantic.BaseModel = BaseModel
        pydantic.Field = lambda *args, **kwargs: None
        sys.modules["pydantic"] = pydantic


_install_import_stubs()

import agent_runs  # noqa: E402
import proactive_store as store  # noqa: E402
from agent_runs import CancelledRunError  # noqa: E402
from opendevin_runner import OpenDevinResult  # noqa: E402
from proactive_execution_control import (  # noqa: E402
    ProactiveExecutionTimeout,
    candidate_blocks_pr_approval,
    guard_proactive_not_cancelled,
    run_executor_with_timeout,
)
from proactive_materialize import (  # noqa: E402
    apply_candidate_materialize_state,
    apply_run_materialize_state,
    assert_materialize_consistency,
    build_proactive_run_record,
    sync_materialize_pair,
)
from proactive_orchestrator import execute_candidate_run  # noqa: E402


REPO = "https://github.com/example/proactive-exec-control.git"
PROJECT = "exec-control-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _minimal_candidate(*, batch_id: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "batchId": batch_id,
        "repoUrl": REPO,
        "repoName": "example",
        "projectId": PROJECT,
        "status": "selected",
        "stage": "selected",
        "title": "Cancel/timeout regression",
        "hypothesis": "Exercise execution control paths.",
        "evidence": ["control-path"],
        "dedupeKey": "src/a.ts:improvement",
        "score": {
            "total": 0.8,
            "signal": 0.7,
            "validation": 0.7,
            "centrality": 0.5,
            "risk": 0.88,
            "riskLabel": "low",
        },
        "timeline": [],
        "reviewReady": False,
    }


def _link_run(candidate: dict[str, Any]) -> tuple[dict[str, Any], str]:
    run_id = uuid.uuid4().hex
    run = build_proactive_run_record(candidate, run_id)
    agent_runs.write_run(run)
    apply_candidate_materialize_state(candidate, "run_linked", run_id=run_id)
    return candidate, run_id


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-exec-control-"))
    runs_root = tmp_root / "agent-runs"
    runs_root.mkdir(parents=True)
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    agent_runs.RUNS_ROOT = runs_root
    agent_runs.ensure_runs_root()

    discovery = tmp_root / "discovery"
    discovery.mkdir()
    (discovery / "src").mkdir()
    (discovery / "src" / "a.ts").write_text("// TODO\n", encoding="utf-8")

    try:
        candidate = _minimal_candidate(batch_id="batch-dry")
        run_id = uuid.uuid4().hex
        run = build_proactive_run_record(candidate, run_id)
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            "cancelled",
            reason="dry-run cancel",
            completed=True,
        )
        assert_materialize_consistency(candidate, run)
        _assert(run["status"] == "cancelled", "cancelled phase should set run cancelled")
        _assert(candidate["status"] == "needs_execution", "cancelled phase should set candidate needs_execution")
        _assert(candidate["stage"] == "cancelled", "cancelled stage expected")
        _assert(candidate["reviewReady"] is False, "cancelled must not be review ready")

        candidate = _minimal_candidate(batch_id="batch-dry")
        run = build_proactive_run_record(candidate, uuid.uuid4().hex)
        candidate, run = sync_materialize_pair(
            candidate,
            run,
            "timed_out",
            reason="dry-run timeout",
            completed=True,
        )
        assert_materialize_consistency(candidate, run)
        _assert(run["status"] == "failed", "timeout phase should fail run")
        _assert((run.get("artifacts") or {}).get("failureCategory") == "timeout", "timeout failure category")
        _assert(candidate["stage"] == "timed_out", "timed_out stage expected")

        stopped = dict(candidate)
        stopped.setdefault("reviewMetadata", {})["prApprovalBlocked"] = True
        _assert(candidate_blocks_pr_approval(stopped), "blocked metadata should block PR approval")

        run_id = uuid.uuid4().hex
        run = build_proactive_run_record(_minimal_candidate(batch_id="batch-guard"), run_id)
        run["control"]["cancelRequested"] = True
        agent_runs.write_run(run)
        try:
            guard_proactive_not_cancelled(run_id)
            _fail("guard should raise when cancelRequested is set")
        except CancelledRunError:
            pass

        try:
            run_executor_with_timeout(lambda: time.sleep(3), timeout_seconds=1)
            _fail("timeout wrapper should raise ProactiveExecutionTimeout")
        except ProactiveExecutionTimeout:
            pass

        batch = store.create_batch(REPO, PROJECT, 1, "head-exec", "example")
        candidate_cancel, run_id_cancel = _link_run(_minimal_candidate(batch_id=batch["id"]))
        store.update_candidate(candidate_cancel)
        run_loaded = agent_runs.read_run(run_id_cancel)
        run_loaded["control"]["cancelRequested"] = True
        agent_runs.write_run(run_loaded)

        cancelled = execute_candidate_run(candidate_cancel, discovery, None)
        store.update_candidate(cancelled)
        run_after = agent_runs.read_run(run_id_cancel)
        _assert(cancelled["status"] == "needs_execution", "live cancel should end needs_execution")
        _assert(cancelled["stage"] == "cancelled", "live cancel stage")
        _assert((cancelled.get("reviewMetadata") or {}).get("prApprovalBlocked"), "cancel should block PR path")
        _assert(run_after and run_after["status"] == "cancelled", "live cancel should cancel linked run")
        _assert(
            any(item.get("kind") == "cancel" for item in (run_after.get("timeline") or [])),
            "run timeline should record cancel",
        )
        _assert(
            any(item.get("stage") == "cancelled" for item in (cancelled.get("timeline") or [])),
            "candidate timeline should record cancelled stage",
        )

        candidate_timeout, run_id_timeout = _link_run(_minimal_candidate(batch_id=batch["id"]))
        store.update_candidate(candidate_timeout)

        def _slow_factory(_workspace: str, _run: dict[str, Any], _env: Optional[dict[str, Any]]):
            class _Runner:
                def run(self, **_kwargs: Any) -> OpenDevinResult:
                    time.sleep(2)
                    result = OpenDevinResult()
                    result.patch = "late"
                    result.success = True
                    return result

            return _Runner()

        timed_out = execute_candidate_run(
            candidate_timeout,
            discovery,
            None,
            runner_factory=_slow_factory,
            executor_timeout_seconds=1,
        )
        store.update_candidate(timed_out)
        run_timeout = agent_runs.read_run(run_id_timeout)
        _assert(timed_out["status"] == "needs_execution", "timeout should end needs_execution")
        _assert(timed_out["stage"] == "timed_out", "timeout stage expected")
        _assert((timed_out.get("reviewMetadata") or {}).get("prApprovalBlocked"), "timeout should block PR path")
        _assert(run_timeout and run_timeout["status"] == "failed", "timeout should fail linked run")
        _assert((run_timeout.get("artifacts") or {}).get("failureCategory") == "timeout", "timeout failure category")
        _assert(
            any(item.get("kind") == "timeout" for item in (run_timeout.get("timeline") or [])),
            "run timeline should record timeout",
        )

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        agent_runs.RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"

    print("OK: proactive execution control")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
