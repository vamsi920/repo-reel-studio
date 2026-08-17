#!/usr/bin/env python3
"""Deterministic validation for proactive_store persistence (pass 02/40)."""

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

import proactive_store as store  # noqa: E402


REPO = "https://github.com/example/proactive-store-test.git"
PROJECT = "validate-project"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _required_status_keys(payload: dict) -> None:
    for key in ("config", "batch", "ready", "target", "candidates", "shortfallReason"):
        _assert(key in payload, f"summarize_status missing key {key}")


def main() -> int:
    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-store-validate-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        repo_url = REPO
        project_id = PROJECT

        cfg = store.get_config(repo_url, project_id)
        _assert(cfg["enabled"] is False, "default enabled should be false")
        _assert(cfg["targetCount"] == 6, "default targetCount should be 6")

        updated = store.update_config(repo_url, project_id, {"enabled": True, "targetCount": 4})
        _assert(updated["enabled"] is True and updated["targetCount"] == 4, "config patch not applied")

        batch_a = store.create_batch(repo_url, project_id, 4, "abc123", "example")

        low = store.create_candidate(
            {
                "batchId": batch_a["id"],
                "repoUrl": repo_url,
                "projectId": project_id,
                "status": "discovered",
                "type": "bug",
                "title": "Low score",
                "hypothesis": "test",
                "evidence": [],
                "score": {"signal": 0.1, "validation": 0.1, "centrality": 0.1, "risk": 0.1, "total": 0.2},
                "dedupeKey": "a:bug",
            }
        )
        high = store.create_candidate(
            {
                "batchId": batch_a["id"],
                "repoUrl": repo_url,
                "projectId": project_id,
                "status": "review_ready",
                "type": "improvement",
                "title": "High score",
                "hypothesis": "test",
                "evidence": [],
                "score": {"signal": 0.9, "validation": 0.9, "centrality": 0.9, "risk": 0.9, "total": 0.95},
                "dedupeKey": "b:improvement",
            }
        )
        tie_old = store.create_candidate(
            {
                "id": "tie-old-candidate",
                "batchId": batch_a["id"],
                "repoUrl": repo_url,
                "projectId": project_id,
                "status": "discovered",
                "type": "bug",
                "title": "Tie older",
                "hypothesis": "test",
                "evidence": [],
                "score": {"signal": 0.5, "validation": 0.5, "centrality": 0.5, "risk": 0.5, "total": 0.5},
                "dedupeKey": "c:bug",
                "createdAt": "2020-01-01T00:00:00Z",
            }
        )
        tie_new = store.create_candidate(
            {
                "id": "tie-new-candidate",
                "batchId": batch_a["id"],
                "repoUrl": repo_url,
                "projectId": project_id,
                "status": "discovered",
                "type": "bug",
                "title": "Tie newer",
                "hypothesis": "test",
                "evidence": [],
                "score": {"signal": 0.5, "validation": 0.5, "centrality": 0.5, "risk": 0.5, "total": 0.5},
                "dedupeKey": "d:bug",
                "createdAt": "2021-01-01T00:00:00Z",
            }
        )

        candidates = store.list_candidates(repo_url, project_id, batch_a["id"])
        _assert(candidates[0]["id"] == high["id"], "candidate sort should rank highest score first")
        tie_ids = [item["id"] for item in candidates if item["score"]["total"] == 0.5]
        _assert(
            tie_ids.index(tie_new["id"]) < tie_ids.index(tie_old["id"]),
            "equal scores should sort by newer createdAt first",
        )

        found = store.find_candidate(high["id"])
        _assert(found and found["id"] == high["id"], "find_candidate failed")

        scope = store.ensure_scope(repo_url, project_id)
        corrupt_path = scope / "candidates" / f"{uuid.uuid4().hex}.json"
        corrupt_path.write_text("{not-json", encoding="utf-8")
        _assert(store._read_json(corrupt_path) is None, "corrupt json should return None")
        _assert(not corrupt_path.exists(), "corrupt file should be quarantined")
        _assert(any(store.ensure_scope(repo_url, project_id).joinpath(".corrupt").iterdir()), "quarantine dir should have backup")

        status = store.summarize_status(repo_url, project_id)
        _required_status_keys(status)
        _assert(status["ready"] >= 1, "summarize_status ready count")
        _assert(isinstance(status["candidates"], list), "summarize_status candidates must be a list")
        _assert(
            all("linkedRun" in item for item in status["candidates"]),
            "enriched candidates must include linkedRun",
        )

        shutil.rmtree(scope / "candidates", ignore_errors=True)
        recovered = store.list_candidates(repo_url, project_id, batch_a["id"])
        _assert(recovered == [], "missing candidates dir should recover and return empty list")

        batch_b = store.create_batch(repo_url, project_id, 3, "def456", "example")
        batch_b["createdAt"] = "2099-01-01T00:00:00Z"
        store.update_batch(batch_b)
        listed = store.list_batches(repo_url, project_id, limit=10)
        _assert(len(listed) >= 2, "expected at least two batches")
        _assert(listed[0]["id"] == batch_b["id"], "latest_batch sort should prefer newest createdAt")
        latest = store.latest_batch(repo_url, project_id)
        _assert(latest and latest["id"] == batch_b["id"], "latest_batch mismatch")

        print("OK: proactive_store validation passed")
        return 0
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
