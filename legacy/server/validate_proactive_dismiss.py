#!/usr/bin/env python3
"""Dismiss flow checks (pass 15/40)."""

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
        sys.modules["fastapi"] = fastapi


_install_import_stubs()

import proactive_store as store  # noqa: E402
from proactive_dismiss import dismiss_proactive_candidate  # noqa: E402


REPO = "https://github.com/example/proactive-dismiss.git"
PROJECT = "dismiss-test"


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
        "title": f"Candidate {status}",
        "hypothesis": "Dismiss flow test.",
        "evidence": ["signal"],
        "dedupeKey": f"src/{uuid.uuid4().hex}.ts:improvement",
        "score": {"total": 0.8, "signal": 0.7, "validation": 0.7, "centrality": 0.5, "risk": 0.88, "riskLabel": "low"},
        "timeline": [],
        "reviewReady": status == "review_ready",
    }


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-dismiss-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        batch = store.create_batch(REPO, PROJECT, 2, "head-dismiss", "example")
        batch_id = batch["id"]

        ready = store.update_candidate(_candidate(batch_id=batch_id, status="review_ready"))
        store.update_candidate(_candidate(batch_id=batch_id, status="discovered"))

        hidden = store.list_candidates(REPO, PROJECT, batch_id, include_dismissed=False)
        _assert(len(hidden) == 2, "active list should include non-dismissed candidates")

        result = dismiss_proactive_candidate(ready, reason="Operator dismissed from test.")
        dismissed = result["candidate"]
        _assert(dismissed["status"] == "dismissed", "candidate should be dismissed")
        timeline = dismissed.get("timeline") or []
        _assert(
            any(item.get("stage") == "dismissed" for item in timeline),
            "timeline should include dismissed event",
        )

        progress = (result.get("batch") or {}).get("progress") or {}
        _assert(progress.get("dismissed") == 1, "batch dismissed count should be 1")
        _assert(progress.get("ready") == 0, "batch ready count should drop after dismissing review_ready")

        hidden_after = store.list_candidates(REPO, PROJECT, batch_id, include_dismissed=False)
        _assert(len(hidden_after) == 1, "dismissed candidate hidden by default")
        _assert(all(item.get("status") != "dismissed" for item in hidden_after), "default list excludes dismissed")

        with_dismissed = store.list_candidates(REPO, PROJECT, batch_id, include_dismissed=True)
        _assert(len(with_dismissed) == 2, "includeDismissed should return dismissed rows")

        try:
            dismiss_proactive_candidate(dismissed, reason="again")
            _fail("second dismiss should fail")
        except Exception as exc:
            _assert(getattr(exc, "status_code", None) == 409, "double dismiss should be 409")

    finally:
        shutil.rmtree(tmp_root, ignore_errors=True)
        os.environ.pop("PROACTIVE_STORE_ROOT", None)

    print("OK: proactive dismiss flow")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
