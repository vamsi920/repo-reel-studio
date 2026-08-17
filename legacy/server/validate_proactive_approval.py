#!/usr/bin/env python3
"""Proactive candidate approval checks (pass 14/40)."""

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

        fastapi.HTTPException = HTTPException
        fastapi.APIRouter = APIRouter = type("APIRouter", (), {"__init__": lambda *a, **k: None})
        sys.modules["fastapi"] = fastapi

    if "pydantic" not in sys.modules:
        pydantic = types.ModuleType("pydantic")

        class BaseModel:
            def model_dump(self, **kwargs: Any) -> dict[str, Any]:
                return dict(self.__dict__)

        pydantic.BaseModel = BaseModel
        pydantic.Field = lambda *args, **kwargs: None
        sys.modules["pydantic"] = pydantic


_install_import_stubs()

import agent_runs  # noqa: E402
import proactive_store as store  # noqa: E402
from proactive_approval import (  # noqa: E402
    APPROVED_INTERNAL,
    PROMOTE_PR,
    approve_proactive_candidate,
    assess_pr_promotion_readiness,
    resolve_proactive_approval,
)
from proactive_materialize import build_proactive_run_record  # noqa: E402


REPO = "https://github.com/example/proactive-approval.git"
PROJECT = "approval-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _candidate(*, batch_id: str, status: str = "review_ready", run_id: Optional[str] = None) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "batchId": batch_id,
        "repoUrl": REPO,
        "repoName": "example",
        "projectId": PROJECT,
        "status": status,
        "stage": status,
        "title": "Approval gate test",
        "hypothesis": "Test approval paths.",
        "evidence": ["signal"],
        "dedupeKey": "src/a.ts:improvement",
        "score": {"total": 0.85, "signal": 0.7, "validation": 0.7, "centrality": 0.5, "risk": 0.88, "riskLabel": "low"},
        "timeline": [],
        "reviewReady": status == "review_ready",
        "runId": run_id,
        "reviewMetadata": {"requiresHumanApproval": True, "patchBacked": True},
    }


def _ready_run(run_id: str, candidate_id: str, *, patch: str = "diff --git a/src/a.ts") -> dict[str, Any]:
    run = build_proactive_run_record(_candidate(batch_id="batch", run_id=run_id), run_id)
    run["status"] = "awaiting_review"
    run["artifacts"]["workspacePath"] = "/tmp/workspace"
    run["artifacts"]["patch"] = patch
    run["artifacts"]["artifactPaths"] = {
        "patchDiff": f"/tmp/{run_id}/patch.diff",
        "validationReport": f"/tmp/{run_id}/validation.json",
    }
    run["artifacts"]["changedFiles"] = [{"path": "src/a.ts", "additions": 1, "deletions": 0}]
    run["proactive"]["candidateId"] = candidate_id
    return run


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-approval-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    agent_runs.RUNS_ROOT = tmp_root / "agent-runs"
    agent_runs.RUNS_ROOT.mkdir(parents=True, exist_ok=True)

    try:
        batch = store.create_batch(REPO, PROJECT, 1, "head-approve", "example")

        run_id = uuid.uuid4().hex
        candidate = _candidate(batch_id=batch["id"], run_id=run_id)
        run = _ready_run(run_id, candidate["id"])
        outcome = resolve_proactive_approval(candidate, run)
        _assert(outcome.action == PROMOTE_PR, "patch-backed awaiting_review should promote")

        store.update_candidate(candidate)
        agent_runs.write_run(run)
        promoted_calls: list[str] = []

        def _promote(rid: str, branch: Optional[str] = None) -> dict[str, Any]:
            promoted_calls.append(rid)
            return {"id": rid, "status": "approved", "approval": {"prUrl": "https://github.com/example/pr/1"}}

        result = approve_proactive_candidate(
            candidate,
            branch_name="proactive/test",
            run_loader=lambda rid: agent_runs.read_run(rid),
            promote_fn=_promote,
        )
        _assert(result["approvalOutcome"] == PROMOTE_PR, "approve should promote PR")
        _assert(promoted_calls == [run_id], "promote_fn should be called once")
        _assert(result["candidate"]["status"] == "approved", "candidate should be approved")

        candidate_no_patch = store.update_candidate(_candidate(batch_id=batch["id"], run_id=uuid.uuid4().hex))
        run_no_patch = _ready_run(candidate_no_patch["runId"], candidate_no_patch["id"], patch="")
        run_no_patch["artifacts"]["artifactPaths"] = {}
        agent_runs.write_run(run_no_patch)
        internal = approve_proactive_candidate(
            candidate_no_patch,
            run_loader=lambda rid: agent_runs.read_run(rid),
            promote_fn=_promote,
        )
        _assert(internal["approvalOutcome"] == APPROVED_INTERNAL, "missing patch should be internal only")
        _assert(internal["candidate"]["status"] == "approved_internal", "candidate approved_internal")
        _assert(len(promoted_calls) == 1, "promote_fn must not run without patch")

        candidate_no_run = store.update_candidate(_candidate(batch_id=batch["id"], run_id=None))
        internal_no_run = approve_proactive_candidate(candidate_no_run, promote_fn=_promote)
        _assert(internal_no_run["approvalOutcome"] == APPROVED_INTERNAL, "missing run should be internal only")
        _assert(len(promoted_calls) == 1, "promote_fn must not run without linked run")

        candidate_done = store.update_candidate(
            _candidate(batch_id=batch["id"], status="approved", run_id=run_id),
        )
        try:
            approve_proactive_candidate(
                candidate_done,
                run_loader=lambda rid: agent_runs.read_run(rid),
                promote_fn=_promote,
            )
            _fail("already approved candidate should raise")
        except Exception as exc:
            from fastapi import HTTPException

            _assert(isinstance(exc, HTTPException), "expected HTTPException")
            _assert(exc.status_code == 409, "already approved should be 409")
        _assert(len(promoted_calls) == 1, "promote_fn must not run for already approved candidate")

        run_approved = _ready_run(uuid.uuid4().hex, uuid.uuid4().hex)
        run_approved["approval"] = {"status": "approved", "prUrl": "https://github.com/example/pr/2"}
        ready, detail = assess_pr_promotion_readiness(run_approved)
        _assert(not ready, "run with existing PR should not be promotion-ready")
        _assert("already" in detail.lower(), "detail should mention already approved")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        agent_runs.RUNS_ROOT = Path(__file__).resolve().parent / ".agent-runs"

    print("OK: proactive approval gates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
