from __future__ import annotations

import json
import uuid
from pathlib import Path

from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

install_import_stubs()

from proactive_failure_recovery import (  # noqa: E402
    RECOVERY_CODE_CORRUPT_RUN,
    RECOVERY_CODE_MISSING_RUN,
    RECOVERY_CODE_MISSING_WORKSPACE,
    RECOVERY_CODE_VALIDATION_FAILED,
    safe_build_status_summary,
    safe_enrich_candidate,
)
from proactive_store import summarize_status, update_candidate  # noqa: E402


class ProactiveFailureRecoveryTests(ProactiveTempStoreMixin):
    def _candidate(self, **overrides: object) -> dict:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head", "example")
        payload = {
            "batchId": batch["id"],
            "repoUrl": REPO_URL,
            "projectId": PROJECT_ID,
            "status": "needs_execution",
            "type": "improvement",
            "title": "Recovery test",
            "hypothesis": "h",
            "evidence": [],
            "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            "score": {"total": 0.7},
            "timeline": [],
            "reviewMetadata": {
                "executionFailureKind": "execution_error",
                "executionReason": "Executor raised a synthetic exception.",
            },
        }
        payload.update(overrides)
        return self.store.create_candidate(payload)

    def _write_run(self, run_id: str, payload: dict) -> Path:
        from agent_runs import run_json_path

        path = run_json_path(run_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return path

    def test_corrupt_candidate_quarantined_status_still_usable(self) -> None:
        good = self._candidate(status="review_ready")
        scope = self.store.ensure_scope(REPO_URL, PROJECT_ID)
        corrupt_path = scope / "candidates" / "corrupt-candidate.json"
        corrupt_path.write_text("{not-json", encoding="utf-8")

        status = summarize_status(REPO_URL, PROJECT_ID)
        self.assertIn("config", status)
        self.assertIn("candidates", status)
        self.assertGreaterEqual(status.get("storeRecovery", {}).get("quarantinedRecords", 0), 1)
        ids = {item["id"] for item in status["candidates"]}
        self.assertIn(good["id"], ids)

    def test_missing_run_returns_recovery_linked_summary(self) -> None:
        run_id = uuid.uuid4().hex
        candidate = self._candidate(runId=run_id)
        enriched = safe_enrich_candidate(candidate)
        linked = enriched.get("linkedRun") or {}
        self.assertEqual(linked.get("status"), "unavailable")
        self.assertEqual(linked.get("recoveryCode"), RECOVERY_CODE_MISSING_RUN)
        self.assertIn("linkedRun", enriched.get("recovery", {}))

    def test_corrupt_run_json_recovery(self) -> None:
        run_id = uuid.uuid4().hex
        path = self._write_run(run_id, {"id": run_id, "status": "failed"})
        path.write_text("{broken", encoding="utf-8")
        candidate = self._candidate(runId=run_id)
        linked = (safe_enrich_candidate(candidate).get("linkedRun") or {})
        self.assertEqual(linked.get("recoveryCode"), RECOVERY_CODE_CORRUPT_RUN)

    def test_missing_workspace_recovery(self) -> None:
        run_id = uuid.uuid4().hex
        self._write_run(
            run_id,
            {
                "id": run_id,
                "status": "failed",
                "artifacts": {"workspacePath": str(self._tmp_root / "missing-workspace")},
                "timeline": [],
            },
        )
        candidate = self._candidate(runId=run_id)
        linked = (safe_enrich_candidate(candidate).get("linkedRun") or {})
        self.assertEqual(linked.get("recoveryCode"), RECOVERY_CODE_MISSING_WORKSPACE)

    def test_validation_failure_recovery(self) -> None:
        run_id = uuid.uuid4().hex
        self._write_run(
            run_id,
            {
                "id": run_id,
                "status": "failed",
                "artifacts": {
                    "validation": {
                        "overallStatus": "failed",
                        "commands": [
                            {
                                "command": "npm test",
                                "exitCode": 1,
                                "stdout": "",
                                "stderr": "expected 1",
                                "durationMs": 12,
                            }
                        ],
                        "notes": ["npm test failed"],
                    }
                },
                "timeline": [],
            },
        )
        candidate = self._candidate(runId=run_id, status="needs_execution")
        linked = (safe_enrich_candidate(candidate).get("linkedRun") or {})
        self.assertEqual(linked.get("recoveryCode"), RECOVERY_CODE_VALIDATION_FAILED)
        self.assertEqual((linked.get("validation") or {}).get("overallStatus"), "failed")

    def test_executor_exception_metadata_surfaces(self) -> None:
        candidate = self._candidate(
            status="needs_execution",
            reviewMetadata={
                "executionFailureKind": "execution_error",
                "executionReason": "Executor raised a synthetic exception.",
                "failureLabel": "Executor error",
            },
        )
        enriched = safe_enrich_candidate(candidate)
        failure = enriched.get("executionFailure") or {}
        self.assertEqual(failure.get("kind"), "execution_error")
        self.assertIn("synthetic", str(failure.get("reason") or "").lower())

    def test_failed_batch_status(self) -> None:
        prior = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head-done", "example")
        prior["createdAt"] = "2020-01-01T00:00:00Z"
        self.store.transition_batch(prior, "complete", "Earlier batch complete")
        self.store.update_batch(prior)

        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head-fail", "example")
        batch["createdAt"] = "2099-12-31T00:00:00Z"
        self.store.update_batch(batch)
        self.store.transition_batch(batch, "failed", "Dispatch failed: workspace sync error")
        batch["metrics"]["shortfallReason"] = "Dispatch failed: workspace sync error"
        self.store.update_batch(batch)

        status = safe_build_status_summary(REPO_URL, PROJECT_ID)
        self.assertEqual(status["batch"]["id"], batch["id"])
        self.assertEqual(status["batch"]["status"], "failed")
        self.assertIn("Dispatch failed", status.get("shortfallReason") or "")
        self.assertFalse(status.get("storeRecovery", {}).get("degraded"))


if __name__ == "__main__":
    import unittest

    unittest.main()
