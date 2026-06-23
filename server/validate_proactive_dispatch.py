#!/usr/bin/env python3
"""Dispatch idempotency checks for proactive agent (pass 04/40)."""

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
from proactive_dispatch import check_dispatch_idempotency  # noqa: E402


REPO = "https://github.com/example/proactive-dispatch.git"
PROJECT = "dispatch-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _config() -> dict:
    return store.get_config(REPO, PROJECT)


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-dispatch-validate-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        config = _config()
        target = 4

        active = store.create_batch(REPO, PROJECT, target, "head-active", "example")
        store.transition_batch(active, "discovering", "test active batch")
        blocked = check_dispatch_idempotency(REPO, PROJECT, config, target, "head-active")
        _assert(blocked is not None, "active batch should block overlap")
        _assert(blocked["status"] == "in_progress", "overlap status should be in_progress")
        _assert(blocked.get("batch", {}).get("id") == active["id"], "overlap should return active batch")
        store.transition_batch(active, "failed", "test cleanup")

        complete = store.create_batch(REPO, PROJECT, target, "head-same", "example")
        complete["date"] = store.today_key()
        complete["repoHead"] = "head-same"
        store.transition_batch(complete, "complete", "test complete same head")
        reused = check_dispatch_idempotency(REPO, PROJECT, config, target, "head-same")
        _assert(reused is not None, "same-day same-head should reuse batch")
        _assert(reused["status"] == "unchanged", "reuse status should be unchanged")
        _assert(reused.get("batch", {}).get("id") == complete["id"], "reuse should return completed batch")
        _assert(bool(reused.get("reason")), "reuse should include explicit reason")

        allowed = check_dispatch_idempotency(REPO, PROJECT, config, target, "head-new")
        _assert(allowed is None, "same-day different head should allow new dispatch")

        old_scope_config = store.get_config(REPO, "other-day-scope")
        other_day = store.create_batch(REPO, "other-day-scope", target, "head-same", "example")
        other_day["date"] = "2000-01-01"
        other_day["repoHead"] = "head-same"
        store.transition_batch(other_day, "complete", "older day")
        allowed_day = check_dispatch_idempotency(
            REPO,
            "other-day-scope",
            old_scope_config,
            target,
            "head-same",
        )
        _assert(allowed_day is None, "complete batch on another day should not block")

        transitions = complete.get("transitions") or []
        _assert(any(item.get("status") == "complete" for item in transitions), "batch should record transitions")

        print("OK: proactive_dispatch validation passed")
        return 0
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
