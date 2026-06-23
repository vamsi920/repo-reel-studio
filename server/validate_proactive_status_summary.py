#!/usr/bin/env python3
"""summarize_status reliability checks (pass 16/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import proactive_store as store  # noqa: E402
from proactive_status_summary import build_status_summary, resolve_status_batch  # noqa: E402

REPO = "https://github.com/example/proactive-status.git"
PROJECT = "status-test"
REQUIRED_KEYS = ("config", "batch", "ready", "target", "candidates", "shortfallReason")


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _candidate(*, batch_id: str, status: str) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "batchId": batch_id,
        "repoUrl": REPO,
        "repoName": "example",
        "projectId": PROJECT,
        "status": status,
        "stage": status,
        "title": status,
        "hypothesis": "status summary test",
        "evidence": [],
        "dedupeKey": f"{uuid.uuid4().hex}:improvement",
        "score": {"total": 0.9, "signal": 0.8, "validation": 0.8, "centrality": 0.5, "risk": 0.9, "riskLabel": "low"},
        "timeline": [],
        "reviewReady": status == "review_ready",
    }


def _assert_status_shape(payload: dict[str, Any]) -> None:
    for key in REQUIRED_KEYS:
        _assert(key in payload, f"missing response key {key}")
    _assert(isinstance(payload["candidates"], list), "candidates must be a list")
    _assert(len(payload["candidates"]) <= 6, "candidates capped at 6")
    for item in payload["candidates"]:
        _assert("linkedRun" in item, "candidate must include linkedRun enrichment key")


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-status-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        empty = build_status_summary(REPO, PROJECT)
        _assert_status_shape(empty)
        _assert(empty["batch"] is None, "empty store should have no batch")
        _assert(empty["ready"] == 0, "empty ready should be 0")
        _assert(empty["target"] == 6, "empty target from default config")
        _assert(empty["candidates"] == [], "empty candidates list")
        _assert(empty["shortfallReason"] is None, "empty shortfallReason")

        failed = store.create_batch(REPO, PROJECT, 3, "head-fail", "example")
        failed["createdAt"] = "2026-01-01T00:00:00Z"
        store.update_batch(failed)
        store.transition_batch(failed, "failed", "Dispatch failed: sandbox error")
        failed["metrics"]["shortfallReason"] = "Dispatch failed: sandbox error"
        store.update_batch(failed)
        failed_status = build_status_summary(REPO, PROJECT)
        _assert(failed_status["batch"]["id"] == failed["id"], "failed batch should surface")
        _assert(failed_status["shortfallReason"], "failed batch should expose shortfallReason")
        _assert(failed_status["ready"] == 0, "failed batch ready should be 0")

        complete = store.create_batch(REPO, PROJECT, 2, "head-done", "example")
        complete["createdAt"] = "2027-06-01T00:00:00Z"
        store.update_batch(complete)
        store.update_candidate(_candidate(batch_id=complete["id"], status="review_ready"))
        store.update_candidate(_candidate(batch_id=complete["id"], status="review_ready"))
        store.update_candidate(_candidate(batch_id=complete["id"], status="discovered"))
        dismissed = store.update_candidate(_candidate(batch_id=complete["id"], status="review_ready"))
        dismissed["status"] = "dismissed"
        store.update_candidate(dismissed)
        store.transition_batch(complete, "complete", "Dispatch completed")
        complete["metrics"]["shortfallReason"] = None
        complete["progress"] = {"discovered": 3, "selected": 2, "materialized": 1, "ready": 1, "dismissed": 1}
        store.update_batch(complete)

        done_status = build_status_summary(REPO, PROJECT)
        _assert(done_status["batch"]["id"] == complete["id"], "complete batch should be selected")
        _assert(done_status["ready"] == 2, "ready counts non-dismissed review_ready")
        _assert(done_status["target"] == 2, "target should come from batch targetCount")
        _assert(len(done_status["candidates"]) == 3, "dismissed rows hidden from candidates list")
        _assert(all(item.get("status") != "dismissed" for item in done_status["candidates"]), "no dismissed in list")
        _assert(done_status["batch"]["progress"]["ready"] == 2, "batch progress ready should match")
        _assert(done_status["shortfallReason"] is None, "met target should clear shortfall")

        shortfall_batch = store.create_batch(REPO, PROJECT, 2, "head-short", "example")
        shortfall_batch["createdAt"] = "2098-01-01T00:00:00Z"
        store.update_batch(shortfall_batch)
        store.update_candidate(_candidate(batch_id=shortfall_batch["id"], status="review_ready"))
        store.transition_batch(shortfall_batch, "complete", "Dispatch completed")
        shortfall_batch["metrics"]["shortfallReason"] = "1/2 review-ready candidates."
        store.update_batch(shortfall_batch)
        shortfall_status = build_status_summary(REPO, PROJECT)
        _assert(
            shortfall_status["batch"]["id"] == shortfall_batch["id"],
            "newest complete batch selected when no active batch",
        )
        _assert(
            shortfall_status["shortfallReason"] == "1/2 review-ready candidates.",
            "stored shortfall wins when ready below target",
        )
        _assert(shortfall_status["ready"] == 1, "shortfall batch ready count")

        older_complete = store.create_batch(REPO, PROJECT, 4, "head-old", "example")
        older_complete["createdAt"] = "2020-01-01T00:00:00Z"
        store.transition_batch(older_complete, "complete", "older complete")
        store.update_batch(older_complete)

        in_progress = store.create_batch(REPO, PROJECT, 4, "head-active", "example")
        in_progress["createdAt"] = "2099-06-01T00:00:00Z"
        store.transition_batch(in_progress, "discovering", "Scanning repository")
        store.update_batch(in_progress)
        store.update_candidate(_candidate(batch_id=in_progress["id"], status="selected"))

        resolved = resolve_status_batch(REPO, PROJECT)
        _assert(resolved and resolved["id"] == in_progress["id"], "active batch preferred over complete")

        active_status = build_status_summary(REPO, PROJECT)
        _assert(active_status["batch"]["id"] == in_progress["id"], "status should track in-progress batch")
        _assert(active_status["shortfallReason"], "in-progress should include shortfall detail")
        _assert(len(active_status["candidates"]) == 1, "in-progress should list visible candidates")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)

    print("OK: proactive status summary")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
