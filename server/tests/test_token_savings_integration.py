from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import caveman_helper  # noqa: E402
from agent_runs import build_change_set  # noqa: E402
from proactive_ai_console import _compress_field  # noqa: E402


class BuildChangeSetIssueBodyCompressionTests(unittest.TestCase):
    """Regression test for the gap where build_change_set's issue-body prompt
    bypassed compression entirely (raw truncate_text only)."""

    def setUp(self) -> None:
        self._prev = os.environ.get("CAVEMAN_HELPER_ENABLED")
        os.environ["CAVEMAN_HELPER_ENABLED"] = "1"

    def tearDown(self) -> None:
        if self._prev is None:
            os.environ.pop("CAVEMAN_HELPER_ENABLED", None)
        else:
            os.environ["CAVEMAN_HELPER_ENABLED"] = self._prev

    def test_issue_body_is_compressed_in_change_set_prompt(self) -> None:
        self.assertTrue(caveman_helper.is_enabled())

        verbose_body = (
            "It is important to note that this is basically a bug report. "
            "As you can see, in order to reproduce it, please note that you should "
            "click the button. Due to the fact that nothing happens, the button is broken."
        )
        issue = {
            "title": "Button broken",
            "body": verbose_body,
            "number": 1,
        }
        # build_change_set calls request_gemini_json, which returns None without a
        # configured API key — it raises RuntimeError in that case, which is fine:
        # we only need to inspect the prompt it builds before that call, so we
        # patch the network call out.
        captured_prompts: list[str] = []

        import agent_runs

        original = agent_runs.request_gemini_json

        def fake_request_gemini_json(prompt: str, *args, **kwargs):
            captured_prompts.append(prompt)
            return {"summary": "ok", "changes": []}

        agent_runs.request_gemini_json = fake_request_gemini_json
        try:
            build_change_set(issue, {"candidateDocuments": [], "trackedFiles": []}, {"summary": "fix it"})
        finally:
            agent_runs.request_gemini_json = original

        self.assertEqual(len(captured_prompts), 1)
        prompt = captured_prompts[0]
        # The verbose filler phrases should be stripped, not sent verbatim.
        self.assertNotIn("It is important to note that", prompt)
        self.assertNotIn("As you can see", prompt)
        self.assertNotIn("Due to the fact that", prompt)
        # But the actual bug report content must survive.
        self.assertIn("click the button", prompt)
        self.assertIn("button is broken", prompt)


class ProactiveConsoleLogCompressionTests(unittest.TestCase):
    """Regression test for the gap where the proactive console-log Gemini
    prompt had zero compression."""

    def test_compress_field_strips_filler_from_plain_value(self) -> None:
        verbose = "Just really actually starting to basically prepare the sandbox"
        compressed = _compress_field(verbose)
        self.assertNotEqual(compressed, verbose)
        self.assertNotIn("just", compressed.lower())
        self.assertNotIn("really", compressed.lower())
        self.assertNotIn("basically", compressed.lower())
        self.assertIn("prepare the sandbox", compressed)

    def test_compress_field_preserves_empty_and_paths(self) -> None:
        self.assertEqual(_compress_field(""), "")
        path_text = "See ./src/lib/agentRuns.ts for details."
        self.assertIn("./src/lib/agentRuns.ts", _compress_field(path_text))


if __name__ == "__main__":
    unittest.main()
