#!/usr/bin/env python3
"""Review-ready gate checks (pass 13/40)."""

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
from proactive_materialize import build_proactive_run_record  # noqa: E402
from proactive_no_patch_failure import FAILURE_KIND_NO_PATCH  # noqa: E402
from proactive_orchestrator import (  # noqa: E402
    apply_candidate_materialize_state,
    execute_candidate_run,
    mark_candidate_ready,
)
from proactive_review_ready import (  # noqa: E402
    VALIDATION_COVERAGE_MISSING,
    VALIDATION_COVERAGE_PARTIAL,
    assess_review_ready_package,
)


REPO = "https://github.com/example/proactive-review-ready.git"
PROJECT = "review-ready-test"


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
        "title": "Review-ready gate",
        "hypothesis": "Test patch-backed promotion.",
        "evidence": ["signal"],
        "dedupeKey": "src/a.ts:improvement",
        "score": {
            "total": 0.82,
            "signal": 0.7,
            "validation": 0.7,
            "centrality": 0.5,
            "risk": 0.88,
            "riskLabel": "low",
        },
        "timeline": [],
        "reviewReady": False,
    }


def _package(
    *,
    patch: str = "diff",
    files: Optional[list[dict[str, Any]]] = None,
    validation: Optional[dict[str, Any]] = None,
    policy: Optional[list[str]] = None,
) -> dict[str, Any]:
    changed_files = (
        [{"path": "src/a.ts", "additions": 1, "deletions": 0}]
        if files is None
        else files
    )
    return assess_review_ready_package(
        patch=patch,
        changed_files=changed_files,
        artifact_paths={"patchDiff": "/tmp/patch.diff", "validationReport": "/tmp/validation.json"},
        validation=validation or {"overallStatus": "passed", "commands": [{"command": "npm test", "exitCode": 0}]},
        quality_gates={"gates": [{"gate": "test", "status": "passed"}], "recommendation": "review"},
        policy_violations=policy,
    )


def _mock_factory(
    *,
    patch: str,
    changed_files: Optional[list[dict[str, Any]]] = None,
    validation: Optional[dict] = None,
    use_default_files: bool = True,
):
    def factory(_workspace: str, _run: dict[str, Any], _env: Optional[dict[str, Any]]):
        class _Runner:
            def run(self, **_kwargs: Any) -> OpenDevinResult:
                result = OpenDevinResult()
                result.patch = patch
                result.success = bool(patch.strip())
                if changed_files is not None:
                    result.changed_files = changed_files
                elif use_default_files:
                    result.changed_files = [{"path": "src/a.ts", "additions": 2, "deletions": 0}]
                else:
                    result.changed_files = []
                result.diff_stat = "1 file changed"
                result.validation = validation or {"overallStatus": "not_run", "commands": [], "notes": []}
                result.quality_gates = {"gates": [], "recommendation": "review"}
                return result

        return _Runner()

    return factory


def main() -> int:
    ready = _package()
    _assert(ready["eligible"], "complete package should be review_ready eligible")

    missing_files = _package(patch="diff", files=[])
    _assert(not missing_files["eligible"], "missing changed files should be ineligible")

    missing_validation_meta = assess_review_ready_package(
        patch="diff",
        changed_files=[{"path": "src/a.ts"}],
        artifact_paths={"patchDiff": "/tmp/patch.diff"},
        validation=None,
        quality_gates={"gates": []},
    )
    _assert(not missing_validation_meta["eligible"], "missing validation metadata should be ineligible")

    partial = _package(
        validation={"overallStatus": "partial", "commands": [{"command": "npm test", "exitCode": 1}]},
    )
    _assert(partial["eligible"], "partial validation should still allow review_ready")
    _assert(partial["validationCoverage"] == VALIDATION_COVERAGE_PARTIAL, "partial coverage label")

    missing_cov = _package(validation={"overallStatus": "not_run", "commands": []})
    _assert(missing_cov["eligible"], "missing validation run should still allow review_ready when metadata exists")
    _assert(missing_cov["validationCoverage"] == VALIDATION_COVERAGE_MISSING, "missing coverage label")

    blocked = _package(policy=["Required check 'test' did not pass"])
    _assert(not blocked["eligible"], "policy violations should block review_ready")
    _assert(blocked["policyBlocked"], "policyBlocked flag")

    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-review-ready-"))
    runs_root = tmp_root / "agent-runs"
    runs_root.mkdir(parents=True)
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    agent_runs.RUNS_ROOT = runs_root
    agent_runs.ensure_runs_root()
    discovery = tmp_root / "discovery"
    discovery.mkdir()
    (discovery / "src").mkdir()
    (discovery / "src" / "a.ts").write_text("x\n", encoding="utf-8")

    try:
        batch = store.create_batch(REPO, PROJECT, 1, "head-ready", "example")
        candidate = store.update_candidate(_minimal_candidate(batch_id=batch["id"]))
        run_id = uuid.uuid4().hex
        agent_runs.write_run(build_proactive_run_record(candidate, run_id))
        apply_candidate_materialize_state(candidate, "run_linked", run_id=run_id)
        store.update_candidate(candidate)

        promoted = execute_candidate_run(
            candidate,
            discovery,
            None,
            runner_factory=_mock_factory(
                patch="diff --git a/src/a.ts",
                validation={"overallStatus": "not_run", "commands": [], "notes": []},
            ),
        )
        store.update_candidate(promoted)
        _assert(promoted["status"] == "review_ready", "valid patch package should become review_ready")
        _assert(promoted["reviewReady"] is True, "reviewReady flag")
        meta = promoted.get("reviewMetadata") or {}
        _assert(meta.get("requiresHumanApproval") is True, "manual approval still required")
        _assert(meta.get("validationCoverage") == VALIDATION_COVERAGE_MISSING, "honest missing validation label")
        _assert(not meta.get("prApprovalBlocked"), "review_ready should not block PR path")

        candidate2 = store.update_candidate(_minimal_candidate(batch_id=batch["id"]))
        run_id2 = uuid.uuid4().hex
        agent_runs.write_run(build_proactive_run_record(candidate2, run_id2))
        apply_candidate_materialize_state(candidate2, "run_linked", run_id=run_id2)
        store.update_candidate(candidate2)

        rejected = execute_candidate_run(
            candidate2,
            discovery,
            None,
            runner_factory=_mock_factory(patch="orphan diff", changed_files=[]),
        )
        store.update_candidate(rejected)
        _assert(rejected["status"] == "needs_execution", "incomplete package should stay needs_execution")
        _assert(
            (rejected.get("reviewMetadata") or {}).get("executionFailureKind") == FAILURE_KIND_NO_PATCH,
            "incomplete should use no_patch failure kind",
        )

        workspace = discovery
        marked = mark_candidate_ready(
            _minimal_candidate(batch_id=batch["id"]),
            workspace,
            [{"path": "src/a.ts"}],
            assessment=ready,
        )
        _assert(marked["status"] == "review_ready", "mark_candidate_ready direct call")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        agent_runs.RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"

    print("OK: proactive review-ready gates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
