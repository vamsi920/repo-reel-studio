from __future__ import annotations

import unittest

from layman_compress_helper import compress_prompt_prose_safe


class LaymanPromptProseCompressionTests(unittest.TestCase):
    def test_compresses_plain_prose(self) -> None:
        text = (
            "This is basically a planning note that you could consider shortening "
            "in order to reduce prompt size."
        )
        compressed = compress_prompt_prose_safe(text)
        self.assertNotEqual(compressed, text)
        self.assertNotIn("basically", compressed.lower())
        self.assertNotIn("you could consider", compressed.lower())

    def test_preserves_command_lines_exactly(self) -> None:
        text = "\n".join(
            [
                "Please make sure to run checks.",
                "npm test",
                "git diff --check",
            ]
        )
        compressed = compress_prompt_prose_safe(text)
        self.assertIn("npm test", compressed)
        self.assertIn("git diff --check", compressed)

    def test_preserves_paths_and_diff_lines_exactly(self) -> None:
        text = "\n".join(
            [
                "Inspect ./src/lib/agentRuns.ts before merge.",
                "--- a/src/lib/agentRuns.ts",
                "+++ b/src/lib/agentRuns.ts",
                "@@ -1,3 +1,3 @@",
                "-old line",
                "+new line",
            ]
        )
        compressed = compress_prompt_prose_safe(text)
        self.assertIn("./src/lib/agentRuns.ts", compressed)
        self.assertIn("--- a/src/lib/agentRuns.ts", compressed)
        self.assertIn("+++ b/src/lib/agentRuns.ts", compressed)
        self.assertIn("@@ -1,3 +1,3 @@", compressed)
        self.assertIn("-old line", compressed)
        self.assertIn("+new line", compressed)


if __name__ == "__main__":
    unittest.main()
