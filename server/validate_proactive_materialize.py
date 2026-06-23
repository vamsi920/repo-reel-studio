#!/usr/bin/env python3
"""Materialize/run state consistency checks (pass 10/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
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
from proactive_materialize import (  # noqa: E402
    apply_candidate_materialize_state,
    apply_run_materialize_state,
    assert_materialize_consistency,
    build_proactive_run_record,
    sync_materialize_pair,
)
from proactive_store import batch_progress_from_candidates  # noqa: E402
from opendevin_runner import OpenDevinResult  # noqa: E402
from proactive_orchestrator import (  # noqa: E402
    execute_candidate_run,
    materialize_candidate_run,
    refresh_batch_progress,
)


REPO = "https://github.com/example/proactive-materialize.git"
PROJECT = "materialize-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _minimal_candidate(*, batch_id: str, status: str = "selected") -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "batchId": batch_id,
        "repoUrl": REPO,
        "repoName": "example",
        "projectId": PROJECT,
        "status": status,
        "stage": status,
        "title": "Fix TODO in src/a.ts",
        "hypothesis": "Resolve TODO marker.",
        "evidence": ["src/a.ts:12 TODO: tighten validation"],
        "dedupeKey": "src/a.ts:improvement",
        "score": {
            "total": 0.84,
            "signal": 0.7,
            "validation": 0.7,
            "centrality": 0.5,
            "risk": 0.88,
            "riskLabel": "low",
        },
        "timeline": [],
        "reviewReady": False,
    }


def _phase_matrix() -> None:
    run_id = uuid.uuid4().hex
    candidate = _minimal_candidate(batch_id="batch-test")
    run = build_proactive_run_record(candidate, run_id)

    for phase in (
        "run_linked",
        "workspace_ready",
        "executor_started",
        "validating",
        "review_ready",
        "no_patch",
        "execution_error",
        "cancelled",
        "timed_out",
    ):
        apply_candidate_materialize_state(candidate, phase, run_id=run_id)
        apply_run_materialize_state(run, phase, completed=phase in {"review_ready", "no_patch", "execution_error"})
        assert_materialize_consistency(candidate, run)
        _assert((run.get("approval") or {}).get("status") == "pending", f"{phase} must keep approval pending")


def _mock_runner_factory(*, patch: str = "", error: str = "", raise_error: Optional[Exception] = None):
    def factory(_workspace: str, _run: dict[str, Any], _env: Optional[dict[str, Any]]):
        class _Runner:
            def run(self, **_kwargs: Any) -> OpenDevinResult:
                if raise_error:
                    raise raise_error
                result = OpenDevinResult()
                result.patch = patch
                result.error = error or None
                result.success = bool(patch.strip())
                result.changed_files = [{"path": "src/a.ts"}] if patch.strip() else []
                result.diff_stat = "1 file changed" if patch.strip() else ""
                result.validation = {"overallStatus": "passed", "commands": [], "notes": []}
                result.quality_gates = {"gates": []}
                return result

        return _Runner()

    return factory


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-materialize-validate-"))
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
        _phase_matrix()

        batch = store.create_batch(REPO, PROJECT, 1, "head-mat", "example")
        batch_id = batch["id"]
        candidate = store.update_candidate(_minimal_candidate(batch_id=batch_id))

        created = materialize_candidate_run(
            dict(candidate),
            discovery,
            "head-mat",
            runner_factory=_mock_runner_factory(patch="diff --git a/src/a.ts"),
        )
        run = agent_runs.read_run(created["runId"])
        _assert(run is not None, "run record should exist after materialize")
        _assert(created["runId"] == run["id"], "candidate.runId must match run.id")
        _assert(
            created["status"] == "review_ready",
            f"success path should mark candidate review_ready (got {created.get('status')!r}, run={(run or {}).get('status')!r})",
        )
        _assert(created["stage"] == "review_ready", "success path stage should be review_ready")
        _assert(created["reviewReady"] is True, "reviewReady should be true on success")
        _assert(run["status"] == "awaiting_review", "run should await human review")
        _assert((run.get("approval") or {}).get("status") == "pending", "approval gate must stay pending")
        _assert(any(item.get("kind") == "review" for item in run.get("timeline") or []), "run timeline should include review entry")
        _assert(any(item.get("stage") == "review_ready" for item in created.get("timeline") or []), "candidate timeline should include review_ready")

        batch = refresh_batch_progress(batch, REPO, PROJECT, batch_id)
        progress = batch.get("progress") or {}
        _assert(progress.get("materialized") == 1, "batch progress materialized should be 1")
        _assert(progress.get("ready") == 1, "batch progress ready should be 1")

        candidate2 = store.update_candidate(_minimal_candidate(batch_id=batch_id))
        run_id2 = uuid.uuid4().hex
        agent_runs.write_run(build_proactive_run_record(candidate2, run_id2))
        apply_candidate_materialize_state(candidate2, "run_linked", run_id=run_id2)
        store.update_candidate(candidate2)
        no_patch = execute_candidate_run(
            candidate2,
            discovery,
            None,
            runner_factory=_mock_runner_factory(patch="", error="executor returned empty patch"),
        )
        store.update_candidate(no_patch)
        run2 = agent_runs.read_run(no_patch["runId"])
        _assert(no_patch["status"] == "needs_execution", "no-patch path should set needs_execution")
        _assert(no_patch["reviewReady"] is False, "no-patch path must not set reviewReady")
        _assert(run2 and run2["status"] == "failed", "no-patch run should be failed")
        _assert((run2.get("artifacts") or {}).get("failureCategory") == "no_patch", "failure category should be no_patch")

        candidate3 = _minimal_candidate(batch_id=batch_id)
        run_id = uuid.uuid4().hex
        run3 = build_proactive_run_record(candidate3, run_id)
        agent_runs.write_run(run3)
        apply_candidate_materialize_state(candidate3, "run_linked", run_id=run_id)
        store.update_candidate(candidate3)
        errored = execute_candidate_run(
            candidate3,
            discovery,
            None,
            runner_factory=_mock_runner_factory(raise_error=RuntimeError("sandbox unavailable")),
        )
        store.update_candidate(errored)
        run3_loaded = agent_runs.read_run(run_id)
        _assert(errored["status"] == "needs_execution", "exception path should surface needs_execution on candidate")
        _assert(run3_loaded and run3_loaded["status"] == "failed", "exception path should fail run")
        _assert((run3_loaded.get("artifacts") or {}).get("failureCategory") == "execution_error", "exception failure category")

        candidates = store.list_candidates(REPO, PROJECT, batch_id, include_dismissed=True)
        progress2 = batch_progress_from_candidates(candidates)
        _assert(progress2["materialized"] >= 2, "batch progress should count materialized runs")
        _assert(progress2["ready"] == 1, "only one review_ready expected in mixed batch")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        agent_runs.RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"

    print("OK: proactive materialize state consistency")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
