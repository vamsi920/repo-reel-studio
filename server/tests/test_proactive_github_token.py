from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

install_import_stubs()

from proactive_secret_sanitizer import (  # noqa: E402
    TEST_TOKEN_PLACEHOLDER,
    redact_secrets,
    scan_store_tree_for_secrets,
    strip_sensitive_fields,
    transient_github_token,
)
from proactive_store import create_batch, update_batch  # noqa: E402


class ProactiveGithubTokenTests(ProactiveTempStoreMixin):
    def test_strip_sensitive_fields(self) -> None:
        payload = strip_sensitive_fields({"githubToken": TEST_TOKEN_PLACEHOLDER, "enabled": True})
        self.assertNotIn("githubToken", payload)
        self.assertTrue(payload["enabled"])

    def test_transient_github_token_restores_env(self) -> None:
        prior = os.environ.get("GITHUB_TOKEN")
        os.environ["GITHUB_TOKEN"] = "ghp_existing"
        with transient_github_token(TEST_TOKEN_PLACEHOLDER):
            self.assertEqual(os.environ.get("GITHUB_TOKEN"), TEST_TOKEN_PLACEHOLDER)
        self.assertEqual(os.environ.get("GITHUB_TOKEN"), "ghp_existing")
        if prior is None:
            os.environ.pop("GITHUB_TOKEN", None)

    def test_store_write_strips_token(self) -> None:
        batch = create_batch(REPO_URL, PROJECT_ID, 4, "head", "example")
        batch["githubToken"] = TEST_TOKEN_PLACEHOLDER
        update_batch(batch)
        violations = scan_store_tree_for_secrets(self._tmp_root, needles=[TEST_TOKEN_PLACEHOLDER])
        self.assertEqual(violations, [])

    def test_dispatch_passes_token_only_to_workspace_prep(self) -> None:
        captured: dict[str, object] = {}

        def _prep(repo_url: str, project_id: str | None, github_token: str | None = None):
            captured["token"] = github_token
            return {
                "workspacePath": str(self._tmp_root / "ws"),
                "headCommit": "abc",
                "status": "synced",
                "source": "scoped_git",
            }

        with mock.patch("proactive_workspace.prepare_discovery_workspace", side_effect=_prep):
            from proactive_orchestrator import prepare_discovery_workspace

            info = prepare_discovery_workspace(REPO_URL, PROJECT_ID, TEST_TOKEN_PLACEHOLDER)
        self.assertEqual(captured.get("token"), TEST_TOKEN_PLACEHOLDER)
        self.assertEqual(info.get("headCommit"), "abc")
        violations = scan_store_tree_for_secrets(self._tmp_root, needles=[TEST_TOKEN_PLACEHOLDER])
        self.assertEqual(violations, [])

    def test_redact_secrets_masks_token(self) -> None:
        self.assertNotIn("ghp_", redact_secrets(f"bearer {TEST_TOKEN_PLACEHOLDER}"))


if __name__ == "__main__":
    unittest.main()
