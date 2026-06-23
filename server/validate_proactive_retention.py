#!/usr/bin/env python3
"""Retention/cleanup safeguards (pass 23/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import proactive_store as store  # noqa: E402
from proactive_retention import (  # noqa: E402
    execute_retention_plan,
    is_candidate_protected,
    plan_scope_retention,
    protected_batch_ids_for_scope,
)

REPO = "https://github.com/example/proactive-retention.git"
PROJECT = "retention-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _iso_days_ago(days: int) -> str:
    import time

    ts = time.time() - (days * 86400)
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(ts))


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-retention-validate-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    os.environ.pop("PROACTIVE_CLEANUP_EXECUTE", None)
    try:
        old_complete = store.create_batch(REPO, PROJECT, 4, "head-old", "example")
        old_complete["status"] = "complete"
        old_complete["createdAt"] = _iso_days_ago(90)
        old_complete["updatedAt"] = _iso_days_ago(90)
        old_complete["dispatchCompletedAt"] = _iso_days_ago(90)
        store.update_batch(old_complete)

        active = store.create_batch(REPO, PROJECT, 4, "head-active", "example")
        active["status"] = "discovering"
        store.update_batch(active)

        review_ready = store.create_candidate(
            {
                "batchId": old_complete["id"],
                "repoUrl": REPO,
                "projectId": PROJECT,
                "status": "review_ready",
                "type": "improvement",
                "title": "Keep review ready",
                "hypothesis": "test",
                "evidence": [],
                "score": {"total": 0.9},
                "createdAt": _iso_days_ago(90),
                "updatedAt": _iso_days_ago(90),
            }
        )
        dismissed = store.create_candidate(
            {
                "batchId": old_complete["id"],
                "repoUrl": REPO,
                "projectId": PROJECT,
                "status": "dismissed",
                "type": "bug",
                "title": "Old dismissed",
                "hypothesis": "test",
                "evidence": [],
                "score": {"total": 0.2},
                "createdAt": _iso_days_ago(90),
                "updatedAt": _iso_days_ago(90),
                "dismissedAt": _iso_days_ago(90),
            }
        )

        protected_batches = protected_batch_ids_for_scope(REPO, PROJECT, keep_batches=1)
        _assert(active["id"] in protected_batches, "active batch must be protected")
        _assert(is_candidate_protected(review_ready, protected_batches), "review_ready is always protected")
        _assert(not is_candidate_protected(dismissed, protected_batches), "old dismissed can be eligible")

        plan = plan_scope_retention(
            REPO,
            PROJECT,
            retention_days_value=30,
            keep_batches_value=1,
            dry_run=True,
            min_age_hours=0,
        )
        batch_targets = {path.stem for path in plan.batch_paths}
        candidate_targets = {path.stem for path in plan.candidate_paths}

        _assert(active["id"] not in batch_targets, "must not prune active batch")
        _assert(store.latest_batch(REPO, PROJECT)["id"] not in batch_targets, "must not prune latest batch")
        _assert(review_ready["id"] not in candidate_targets, "must not prune review_ready candidate")
        _assert(dismissed["id"] in candidate_targets, "old dismissed on prunable batch should be eligible")

        scope_root = store.ensure_scope(REPO, PROJECT)
        dismissed_path = scope_root / "candidates" / f"{dismissed['id']}.json"
        _assert(dismissed_path.is_file(), "dismissed record should exist before execute")

        os.environ["PROACTIVE_CLEANUP_EXECUTE"] = "1"
        plan.dry_run = False
        result = execute_retention_plan(plan)
        _assert(result.get("deleted", 0) >= 1, "execute should delete at least dismissed candidate")
        _assert(not dismissed_path.is_file(), "dismissed candidate file should be removed")
        _assert(
            (scope_root / "candidates" / f"{review_ready['id']}.json").is_file(),
            "review_ready candidate must remain",
        )
        _assert(
            (scope_root / "batches" / f"{active['id']}.json").is_file(),
            "active batch must remain",
        )

        print("OK: proactive retention and cleanup")
        return 0
    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
