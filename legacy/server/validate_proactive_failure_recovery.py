#!/usr/bin/env python3
"""Failure-mode recovery smoke (pass 37/40)."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import uuid
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

from proactive_failure_recovery import (  # noqa: E402
    RECOVERY_CODE_CORRUPT_RUN,
    RECOVERY_CODE_MISSING_RUN,
    safe_build_status_summary,
    safe_enrich_candidate,
)
import proactive_store as store  # noqa: E402

REPO = "https://github.com/example/proactive-recovery.git"
PROJECT = "recovery"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-recovery-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        batch = store.create_batch(REPO, PROJECT, 2, "head", "example")
        good = store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO,
                "projectId": PROJECT,
                "status": "review_ready",
                "type": "improvement",
                "title": "Good",
                "hypothesis": "ok",
                "evidence": [],
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
                "score": {"total": 0.9},
            }
        )
        scope = store.ensure_scope(REPO, PROJECT)
        (scope / "candidates" / "bad.json").write_text("{", encoding="utf-8")

        status = safe_build_status_summary(REPO, PROJECT)
        _assert(isinstance(status.get("config"), dict), "status must include config")
        _assert(isinstance(status.get("candidates"), list), "status must include candidates")
        _assert(any(item.get("id") == good["id"] for item in status["candidates"]), "good candidate visible")
        _assert(status.get("storeRecovery", {}).get("quarantinedRecords", 0) >= 1, "corrupt file quarantined")

        run_id = uuid.uuid4().hex
        missing = store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO,
                "projectId": PROJECT,
                "status": "needs_execution",
                "type": "improvement",
                "title": "Missing run",
                "hypothesis": "h",
                "evidence": [],
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
                "score": {"total": 0.7},
                "runId": run_id,
            }
        )
        linked = (safe_enrich_candidate(missing).get("linkedRun") or {})
        _assert(linked.get("recoveryCode") == RECOVERY_CODE_MISSING_RUN, "missing run recovery code")

        from agent_runs import run_json_path

        corrupt_run_id = uuid.uuid4().hex
        corrupt_path = run_json_path(corrupt_run_id)
        corrupt_path.parent.mkdir(parents=True, exist_ok=True)
        corrupt_path.write_text("{broken", encoding="utf-8")
        corrupt_candidate = store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO,
                "projectId": PROJECT,
                "status": "needs_execution",
                "type": "improvement",
                "title": "Corrupt run",
                "hypothesis": "h",
                "evidence": [],
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
                "score": {"total": 0.7},
                "runId": corrupt_run_id,
            }
        )
        corrupt_linked = (safe_enrich_candidate(corrupt_candidate).get("linkedRun") or {})
        _assert(corrupt_linked.get("recoveryCode") == RECOVERY_CODE_CORRUPT_RUN, "corrupt run recovery code")
        _assert(corrupt_path.exists(), "corrupt run file should remain for repair")

        batch["createdAt"] = "2020-01-01T00:00:00Z"
        store.transition_batch(batch, "complete", "Fixture batch complete")
        batch["metrics"]["shortfallReason"] = None
        store.update_batch(batch)

        failed = store.create_batch(REPO, PROJECT, 2, "head2", "example")
        failed["createdAt"] = "2099-12-31T00:00:00Z"
        store.update_batch(failed)
        store.transition_batch(failed, "failed", "Dispatch failed: synthetic")
        failed["metrics"]["shortfallReason"] = "Dispatch failed: synthetic"
        store.update_batch(failed)
        failed_status = safe_build_status_summary(REPO, PROJECT)
        _assert(failed_status.get("batch", {}).get("status") == "failed", "failed batch surfaces")
        _assert(failed_status.get("shortfallReason"), "failed batch shortfall present")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)

    print("OK: proactive failure recovery validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
