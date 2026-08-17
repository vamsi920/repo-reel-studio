from __future__ import annotations

import unittest
from layman_compress_helper import compress_prompt_prose_safe


class ProactiveLaymanPromptCompressionTests(unittest.TestCase):
    def _candidate(self) -> dict:
        return {
            "id": "cand-1",
            "batchId": "batch-1",
            "runId": "run-1",
            "projectId": "proj-1",
            "repoUrl": "https://github.com/acme/reel-studio",
            "repoName": "reel-studio",
            "type": "bug",
            "title": "Auth token refresh fails",
            "dedupeKey": "src/auth/session.ts:token-refresh",
            "hypothesis": "This is basically failing in order to refresh token correctly.",
            "evidence": [
                "src/auth/session.ts:132 token refresh branch misses retry",
                "line 144 shows stale session update",
                "You could consider adding guard around refresh state machine",
            ],
            "score": {"total": 0.82, "risk": 0.81},
        }

    def test_preserves_candidate_ids_paths_and_commands_in_prose(self) -> None:
        text = "\n".join(
            [
                "Candidate cand-1 for run run-1 is basically ready.",
                "Path evidence: src/auth/session.ts:132 token refresh branch misses retry",
                "line 144 shows stale session update",
                "npm test",
                "git diff --check",
            ]
        )
        compressed = compress_prompt_prose_safe(text)
        self.assertIn("cand-1", compressed)
        self.assertIn("run-1", compressed)
        self.assertIn("src/auth/session.ts:132 token refresh branch misses retry", compressed)
        self.assertIn("line 144 shows stale session update", compressed)
        self.assertIn("npm test", compressed)
        self.assertIn("git diff --check", compressed)

    def test_compresses_safe_hypothesis_and_explanation_prose(self) -> None:
        hypothesis = compress_prompt_prose_safe(self._candidate()["hypothesis"]).lower()
        self.assertNotIn("basically", hypothesis)
        self.assertNotIn("in order to", hypothesis)
        self_critique = compress_prompt_prose_safe(
            "Static discovery selected this candidate; executor output determines promotion readiness."
        ).lower()
        self.assertNotIn("basically", self_critique)
        self.assertIn("executor output", self_critique)

    def test_diff_lines_are_preserved(self) -> None:
        diff_text = "\n".join(
            [
                "--- a/src/auth/session.ts",
                "+++ b/src/auth/session.ts",
                "@@ -132,3 +132,4 @@",
                "- return staleToken",
                "+ return refreshedToken",
            ]
        )
        compressed = compress_prompt_prose_safe(diff_text)
        self.assertEqual(compressed, diff_text)


if __name__ == "__main__":
    unittest.main()
