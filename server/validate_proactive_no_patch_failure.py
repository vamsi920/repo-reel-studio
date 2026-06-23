#!/usr/bin/env python3
"""No-patch vs executor-crash failure handling (pass 12/40)."""

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
from opendevin_runner import OpenDevinResult  # noqa: E402
from proactive_no_patch_failure import (  # noqa: E402
    FAILURE_KIND_EXECUTION_ERROR,
    FAILURE_KIND_NO_PATCH,
    persist_run_failure,
    summarize_execution_failure,
)
from proactive_materialize import build_proactive_run_record  # noqa: E402
from proactive_orchestrator import (  # noqa: E402
    apply_candidate_materialize_state,
    execute_candidate_run,
    mark_candidate_needs_execution,
)


REPO = "https://github.com/example/proactive-no-patch.git"
PROJECT = "no-patch-test"


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
        "title": "No patch regression",
        "hypothesis": "Test failure metadata.",
        "evidence": ["signal"],
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


def _mock_factory(*, patch: str = "", error: str = "", raise_error: Optional[Exception] = None):
    def factory(_workspace: str, _run: dict[str, Any], _env: Optional[dict[str, Any]]):
        class _Runner:
            def run(self, **_kwargs: Any) -> OpenDevinResult:
                if raise_error:
                    raise raise_error
                result = OpenDevinResult()
                result.patch = patch
                result.error = error or None
                result.success = bool(patch.strip())
                return result

        return _Runner()

    return factory


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-no-patch-"))
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
        marked = mark_candidate_needs_execution(
            _minimal_candidate(batch_id="dry"),
            "Executor finished without diff output.",
            failure_kind=FAILURE_KIND_NO_PATCH,
            executor_source="opendevin",
        )
        meta = marked.get("reviewMetadata") or {}
        _assert(meta.get("executionFailureKind") == FAILURE_KIND_NO_PATCH, "no_patch kind on candidate")
        _assert(meta.get("executionReason"), "executionReason persisted")
        _assert(meta.get("retryInstructions"), "retry instructions persisted")
        _assert(meta.get("prApprovalBlocked"), "PR path should be blocked")

        run = build_proactive_run_record(_minimal_candidate(batch_id="dry"), uuid.uuid4().hex)
        persist_run_failure(
            run,
            failure_kind=FAILURE_KIND_NO_PATCH,
            reason="empty diff",
            source="opendevin",
        )
        _assert((run.get("artifacts") or {}).get("failureCategory") == FAILURE_KIND_NO_PATCH, "run failureCategory no_patch")
        notes = ((run.get("artifacts") or {}).get("validation") or {}).get("notes") or []
        _assert(any("no_patch" in str(note) for note in notes), "validation notes should tag no_patch")

        crash_marked = mark_candidate_needs_execution(
            _minimal_candidate(batch_id="dry"),
            "Sandbox API unavailable",
            failure_kind=FAILURE_KIND_EXECUTION_ERROR,
            executor_source="proactive",
        )
        _assert(
            (crash_marked.get("reviewMetadata") or {}).get("executionFailureKind") == FAILURE_KIND_EXECUTION_ERROR,
            "execution_error kind on candidate",
        )

        batch = store.create_batch(REPO, PROJECT, 1, "head-nopatch", "example")
        candidate = store.update_candidate(_minimal_candidate(batch_id=batch["id"]))
        run_id = uuid.uuid4().hex
        agent_runs.write_run(build_proactive_run_record(candidate, run_id))
        apply_candidate_materialize_state(candidate, "run_linked", run_id=run_id)
        store.update_candidate(candidate)

        no_patch = execute_candidate_run(
            candidate,
            discovery,
            None,
            runner_factory=_mock_factory(patch="", error=""),
        )
        store.update_candidate(no_patch)
        run_loaded = agent_runs.read_run(run_id)
        _assert((run_loaded.get("artifacts") or {}).get("failureCategory") == FAILURE_KIND_NO_PATCH, "live no_patch category")
        enriched = store.enrich_candidate(no_patch)
        failure = enriched.get("executionFailure") or {}
        _assert(failure.get("isNoPatch") is True, "API enrichment should flag no patch")
        _assert(failure.get("isBackendCrash") is False, "no patch is not backend crash")

        candidate_crash = store.update_candidate(_minimal_candidate(batch_id=batch["id"]))
        run_id_crash = uuid.uuid4().hex
        agent_runs.write_run(build_proactive_run_record(candidate_crash, run_id_crash))
        apply_candidate_materialize_state(candidate_crash, "run_linked", run_id=run_id_crash)
        store.update_candidate(candidate_crash)

        crashed = execute_candidate_run(
            candidate_crash,
            discovery,
            None,
            runner_factory=_mock_factory(raise_error=RuntimeError("executor backend offline")),
        )
        store.update_candidate(crashed)
        run_crash = agent_runs.read_run(run_id_crash)
        _assert(
            (run_crash.get("artifacts") or {}).get("failureCategory") == FAILURE_KIND_EXECUTION_ERROR,
            "crash path should set execution_error",
        )
        enriched_crash = store.enrich_candidate(crashed)
        crash_failure = enriched_crash.get("executionFailure") or {}
        _assert(crash_failure.get("isBackendCrash") is True, "API enrichment should flag backend crash")
        _assert(crash_failure.get("isNoPatch") is False, "crash is not no patch")

        summary = summarize_execution_failure(crashed, enriched_crash.get("linkedRun"))
        _assert(summary and summary.get("kind") == FAILURE_KIND_EXECUTION_ERROR, "summarize should match crash")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        agent_runs.RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"

    print("OK: proactive no-patch failure handling")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
