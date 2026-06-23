from __future__ import annotations

import os
import unittest
import uuid
from typing import Any
from unittest.mock import patch

from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

try:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    HAVE_FASTAPI = True
except ImportError:  # pragma: no cover
    HAVE_FASTAPI = False
    FastAPI = None  # type: ignore[misc, assignment]
    TestClient = None  # type: ignore[misc, assignment]

TEST_CRON = "proactive-api-test-cron-token"


def _structured_detail(response) -> dict[str, Any]:
    payload = response.json()
    detail = payload.get("detail")
    if isinstance(detail, dict):
        return detail
    return payload


def build_proactive_api_app() -> Any:
    """Mirror agent_runs_app proactive mount (handlers + /api prefix)."""
    from proactive_api import create_proactive_router
    from proactive_api_errors import register_proactive_exception_handlers

    app = FastAPI(title="proactive-api-test")
    register_proactive_exception_handlers(app)
    app.include_router(create_proactive_router(), prefix="/api")
    return app


@unittest.skipUnless(HAVE_FASTAPI, "fastapi not installed (pip install -r server/requirements.txt)")
class ProactiveApiRouteTests(ProactiveTempStoreMixin):
    def setUp(self) -> None:
        super().setUp()
        install_import_stubs()
        self._prior_cron = os.environ.get("PROACTIVE_CRON_TOKEN")
        os.environ.pop("PROACTIVE_CRON_TOKEN", None)
        self.app = build_proactive_api_app()
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        if self._prior_cron is None:
            os.environ.pop("PROACTIVE_CRON_TOKEN", None)
        else:
            os.environ["PROACTIVE_CRON_TOKEN"] = self._prior_cron
        super().tearDown()

    def test_config_get_and_update(self) -> None:
        get_resp = self.client.get("/api/proactive/config", params={"repoUrl": REPO_URL, "projectId": PROJECT_ID})
        self.assertEqual(get_resp.status_code, 200)
        self.assertFalse(get_resp.json()["config"]["enabled"])

        patch_resp = self.client.post(
            "/api/proactive/config",
            json={"repoUrl": REPO_URL, "projectId": PROJECT_ID, "enabled": True, "targetCount": 4},
        )
        self.assertEqual(patch_resp.status_code, 200)
        self.assertTrue(patch_resp.json()["config"]["enabled"])
        self.assertEqual(patch_resp.json()["config"]["targetCount"], 4)

        bad = self.client.post(
            "/api/proactive/config",
            json={"repoUrl": REPO_URL, "projectId": PROJECT_ID, "morningDeadline": "25:99"},
        )
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(_structured_detail(bad).get("code"), "invalid_config")

    def test_status_and_candidates_list_detail(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 3, "abc", "example")
        ready = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "Ready item",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.9},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            }
        )
        self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "dismissed",
                "type": "bug",
                "title": "Dismissed item",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.2},
                "dedupeKey": f"{uuid.uuid4().hex}:bug",
            }
        )

        with patch("proactive_store.run_console_summary", return_value=None):
            status = self.client.get(
                "/api/proactive/status",
                params={"repoUrl": REPO_URL, "projectId": PROJECT_ID},
            )
        self.assertEqual(status.status_code, 200)
        body = status.json()
        self.assertIn("ready", body)
        self.assertIn("candidates", body)
        self.assertEqual(body["ready"], 1)

        listed = self.client.get(
            "/api/proactive/candidates",
            params={"repoUrl": REPO_URL, "projectId": PROJECT_ID, "batchId": batch["id"]},
        )
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.json()["candidates"]), 1)

        with patch("proactive_store.run_console_summary", return_value=None):
            detail = self.client.get(f"/api/proactive/candidates/{ready['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["candidate"]["id"], ready["id"])

    def test_dispatch_skipped_without_executor(self) -> None:
        from proactive_dispatch import (
            DISPATCH_SKIPPED_CODE,
            DISPATCH_SKIPPED_REASON,
            DISPATCH_SKIPPED_STATUS,
            build_dispatch_skipped_response,
        )

        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": False})
        response = self.client.post("/api/proactive/dispatch-daily", json={"repoUrl": REPO_URL, "projectId": PROJECT_ID})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        expected = build_dispatch_skipped_response(self.store.get_config(REPO_URL, PROJECT_ID))
        self.assertEqual(payload, expected)
        self.assertEqual(payload.get("status"), DISPATCH_SKIPPED_STATUS)
        self.assertEqual(payload.get("code"), DISPATCH_SKIPPED_CODE)
        self.assertEqual(payload.get("reason"), DISPATCH_SKIPPED_REASON)
        self.assertTrue(payload.get("manualOnly"))
        self.assertEqual(payload.get("dispatchMode"), "disabled")

    def test_dispatch_requires_cron_when_configured(self) -> None:
        os.environ["PROACTIVE_CRON_TOKEN"] = TEST_CRON
        self.client = TestClient(self.app)
        denied = self.client.post(
            "/api/proactive/dispatch-daily",
            json={"repoUrl": REPO_URL, "projectId": PROJECT_ID},
        )
        self.assertEqual(denied.status_code, 401)
        self.assertEqual(_structured_detail(denied).get("code"), "invalid_cron_token")

    def test_dispatch_authorized_mocks_executor(self) -> None:
        os.environ["PROACTIVE_CRON_TOKEN"] = TEST_CRON
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": True})
        self.client = TestClient(self.app)
        stub = {
            "status": "complete",
            "config": self.store.get_config(REPO_URL, PROJECT_ID),
            "batch": {"id": "batch-stub"},
            "ready": 1,
            "target": 4,
            "candidates": [],
            "shortfallReason": None,
        }
        with patch("proactive_api.dispatch_daily", return_value=stub):
            response = self.client.post(
                "/api/proactive/dispatch-daily",
                json={"repoUrl": REPO_URL, "projectId": PROJECT_ID, "targetCount": 4},
                headers={"Authorization": f"Bearer {TEST_CRON}"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "complete")

    def test_approve_internal_without_linked_run(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head", "example")
        candidate = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "Approve me",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.88},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
                "runId": None,
            }
        )
        with patch("proactive_store.run_console_summary", return_value=None):
            response = self.client.post(f"/api/proactive/candidates/{candidate['id']}/approve", json={})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["approvalOutcome"], "approved_internal")
        self.assertEqual(body["candidate"]["status"], "approved_internal")

    def test_dismiss_candidate(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head2", "example")
        candidate = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "Dismiss me",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.7},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            }
        )
        with patch("proactive_store.run_console_summary", return_value=None):
            response = self.client.post(
                f"/api/proactive/candidates/{candidate['id']}/dismiss",
                json={"reason": "Not worth pursuing"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["candidate"]["status"], "dismissed")

    def test_invalid_candidate_returns_structured_404(self) -> None:
        missing_id = uuid.uuid4().hex
        for method, url, kwargs in (
            ("get", f"/api/proactive/candidates/{missing_id}", {}),
            ("post", f"/api/proactive/candidates/{missing_id}/approve", {"json": {}}),
            ("post", f"/api/proactive/candidates/{missing_id}/dismiss", {"json": {}}),
        ):
            response = getattr(self.client, method)(url, **kwargs)
            self.assertEqual(response.status_code, 404, url)
            self.assertEqual(_structured_detail(response).get("code"), "candidate_not_found", url)

    def test_agent_runs_app_preserves_proactive_mount(self) -> None:
        from agent_runs_app import app as agent_app

        paths = {getattr(route, "path", "") for route in agent_app.routes}
        expected = {
            "/api/proactive/config",
            "/api/proactive/status",
            "/api/proactive/candidates",
            "/api/proactive/dispatch-daily",
        }
        self.assertTrue(expected.issubset(paths), f"missing proactive routes: {expected - paths}")


if __name__ == "__main__":
    unittest.main()
