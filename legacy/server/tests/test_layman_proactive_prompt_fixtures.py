from __future__ import annotations

import unittest

from layman_compress_helper import compress_prompt_prose_safe


class LaymanProactivePromptFixturesTests(unittest.TestCase):
    def test_preserves_proactive_console_prompt_tokens(self) -> None:
        fixture = "\n".join(
            [
                'Return strict JSON only:',
                '{"title":"<=7 words","detail":"<=120 chars, first-person present tense"}',
                "",
                "Rules:",
                "- You could consider summarizing only observed state details.",
                "- Do NOT invent commands or edits.",
                "This is basically an operator narration note that should be shorter.",
                "",
                "State:",
                "stage=patching",
                "event=Validation collecting",
                "detail=src/auth/session.ts:132 token refresh branch misses retry",
                "candidate_title=Auth token refresh fails",
                "run_id=run-123",
                "candidate_id=cand-456",
                "command=npm test && git diff --check",
                "docs=https://example.com/internal/proactive",
                "symbol=authenticateUser",
            ]
        )

        compressed = compress_prompt_prose_safe(fixture)
        self.assertIn('{"title":"<=7 words","detail":"<=120 chars, first-person present tense"}', compressed)
        self.assertIn("stage=patching", compressed)
        self.assertIn("detail=src/auth/session.ts:132 token refresh branch misses retry", compressed)
        self.assertIn("run_id=run-123", compressed)
        self.assertIn("candidate_id=cand-456", compressed)
        self.assertIn("npm test && git diff --check", compressed)
        self.assertIn("https://example.com/internal/proactive", compressed)
        self.assertIn("authenticateUser", compressed)
        self.assertNotIn("basically", compressed.lower())
        self.assertLess(len(compressed), len(fixture))


if __name__ == "__main__":
    unittest.main()
