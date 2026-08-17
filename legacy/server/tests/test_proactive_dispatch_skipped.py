from __future__ import annotations

import unittest

from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

install_import_stubs()

from proactive_dispatch import (  # noqa: E402
    DISPATCH_SKIPPED_CODE,
    DISPATCH_SKIPPED_REASON,
    DISPATCH_SKIPPED_STATUS,
    build_dispatch_skipped_response,
)
from proactive_orchestrator import dispatch_daily  # noqa: E402


class ProactiveDispatchSkippedTests(ProactiveTempStoreMixin):
    def test_build_dispatch_skipped_response_stable(self) -> None:
        config = self.store.get_config(REPO_URL, PROJECT_ID)
        config["enabled"] = False
        payload = build_dispatch_skipped_response(config)
        self.assertEqual(payload["status"], DISPATCH_SKIPPED_STATUS)
        self.assertEqual(payload["reason"], DISPATCH_SKIPPED_REASON)
        self.assertEqual(payload["code"], DISPATCH_SKIPPED_CODE)
        self.assertEqual(payload["dispatchMode"], "disabled")
        self.assertTrue(payload["manualOnly"])
        self.assertIsNone(payload["batch"])
        self.assertEqual(payload["ready"], 0)
        self.assertEqual(payload["candidates"], [])
        self.assertEqual(payload["shortfallReason"], DISPATCH_SKIPPED_REASON)
        self.assertEqual(payload["target"], 6)

    def test_dispatch_daily_returns_stable_skipped(self) -> None:
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": False, "targetCount": 3})
        result = dispatch_daily(REPO_URL, project_id=PROJECT_ID)
        expected = build_dispatch_skipped_response(self.store.get_config(REPO_URL, PROJECT_ID))
        self.assertEqual(result, expected)
        self.assertEqual(result["target"], 3)

    def test_list_enabled_scopes(self) -> None:
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": True})
        enabled = self.store.list_proactive_dispatch_scopes(enabled_only=True)
        self.assertEqual(len(enabled), 1)
        self.assertEqual(enabled[0]["repoUrl"], REPO_URL)
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": False})
        self.assertEqual(self.store.list_proactive_dispatch_scopes(enabled_only=True), [])


if __name__ == "__main__":
    unittest.main()
