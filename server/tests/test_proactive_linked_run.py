from __future__ import annotations

import unittest

from proactive_linked_run import (
    LINKED_RUN_STDOUT_LIMIT,
    build_linked_run_summary,
    normalize_validation_block,
    truncate_linked_run_text,
)


class ProactiveLinkedRunTests(unittest.TestCase):
    def test_truncates_validation_logs(self) -> None:
        long_stdout = "x" * (LINKED_RUN_STDOUT_LIMIT + 50)
        commands = normalize_validation_block(
            {
                "overallStatus": "partial",
                "commands": [
                    {
                        "command": "npm test",
                        "exitCode": 1,
                        "stdout": long_stdout,
                        "stderr": "AssertionError: expected true",
                        "durationMs": 1200,
                        "kind": "validation",
                    }
                ],
                "notes": ["Validation completed with failures."],
            },
        )
        self.assertEqual(len(commands["commands"]), 1)
        self.assertTrue(commands["commands"][0]["stdout"].endswith("..."))
        self.assertLessEqual(len(commands["commands"][0]["stdout"]), LINKED_RUN_STDOUT_LIMIT)

    def test_build_linked_run_summary_realistic(self) -> None:
        run = {
            "id": "run-abc123",
            "status": "awaiting_review",
            "updatedAt": "2026-05-27T12:00:00Z",
            "timeline": [{"id": "t1", "at": "2026-05-27T12:00:00Z", "kind": "validate", "title": "Validated", "detail": "", "level": "info"}],
            "issue": {"title": "Resolve TODO in src/util.ts"},
            "artifacts": {
                "patch": "diff --git a/src/util.ts",
                "diffStat": "1 file changed, 2 insertions(+), 1 deletion(-)",
                "changedFiles": [{"path": "src/util.ts", "additions": 2, "deletions": 1, "changedLines": 3, "sensitive": False}],
                "validation": {
                    "overallStatus": "partial",
                    "commands": [
                        {
                            "command": "npm test",
                            "exitCode": 1,
                            "stdout": "FAIL src/util.test.ts",
                            "stderr": "expected 1 to equal 2",
                            "durationMs": 842,
                            "kind": "validation",
                        }
                    ],
                    "notes": ["One validation command failed."],
                },
                "testMatrix": {
                    "suites": [
                        {
                            "suite": "test",
                            "command": "npm test",
                            "status": "failed",
                            "durationMs": 842,
                            "exitCode": 1,
                            "failureSummary": "expected 1 to equal 2",
                            "impactedFiles": ["src/util.ts"],
                            "logRef": None,
                        }
                    ],
                    "overallStatus": "partial",
                    "totalDurationMs": 842,
                    "passRate": 0.0,
                },
                "qualityGates": {
                    "recommendation": "review",
                    "allPassed": False,
                    "gates": [{"gate": "test", "status": "failed", "detail": "npm test"}],
                },
                "changeIntent": {
                    "hypothesis": "Tighten timeout handling in util.ts",
                    "evidenceSufficiency": "moderate",
                },
            },
            "evaluation": {"confidenceScore": 0.71},
        }

        summary = build_linked_run_summary(run)
        assert summary is not None
        self.assertEqual(summary["id"], "run-abc123")
        self.assertTrue(summary["hasPatch"])
        self.assertEqual(summary["validation"]["overallStatus"], "partial")
        self.assertEqual(len(summary["validation"]["commands"]), 1)
        self.assertEqual(summary["changedFiles"][0]["path"], "src/util.ts")
        self.assertEqual(summary["testMatrix"]["suites"][0]["status"], "failed")
        self.assertEqual(summary["qualityGates"]["recommendation"], "review")
        self.assertEqual(summary["changeIntent"]["hypothesis"], "Tighten timeout handling in util.ts")

    def test_truncate_helper(self) -> None:
        self.assertEqual(truncate_linked_run_text("short", 10), "short")
        self.assertTrue(truncate_linked_run_text("abcdefghij", 8).endswith("..."))


if __name__ == "__main__":
    unittest.main()
