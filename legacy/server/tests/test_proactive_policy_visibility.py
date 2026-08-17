from __future__ import annotations

import unittest

from tests.proactive_test_harness import install_import_stubs

install_import_stubs()

from proactive_approval import resolve_proactive_approval  # noqa: E402
from proactive_policy_visibility import (
    POLICY_STATE_BLOCKED,
    POLICY_STATE_WARNING,
    assess_policy_visibility,
    attach_policy_visibility_to_candidate,
)
from proactive_store import enrich_candidate  # noqa: E402


class ProactivePolicyVisibilityTests(unittest.TestCase):
    def test_assess_policy_visibility_states(self) -> None:
        blocked = assess_policy_visibility(violations=["Command not on allowlist"])
        self.assertEqual(blocked["policyStatus"], POLICY_STATE_BLOCKED)
        self.assertTrue(blocked["prApprovalBlocked"])

        warning = assess_policy_visibility(sensitive_paths=["src/auth/login.ts"])
        self.assertEqual(warning["policyStatus"], POLICY_STATE_WARNING)
        self.assertFalse(warning["prApprovalBlocked"])
        self.assertTrue(warning["prPromotionDiscouraged"])

    def test_enrich_candidate_attaches_policy_fields(self) -> None:
        candidate = enrich_candidate(
            {
                "id": "c1",
                "batchId": "b1",
                "status": "needs_execution",
                "reviewMetadata": {
                    "executionFailureKind": "execution_error",
                    "executionReason": "Policy gate",
                    "policyViolations": ["Changed file .env.local matches denylist"],
                    "policyStatus": "blocked",
                    "policySummary": "PR promotion blocked: 1 policy violation(s).",
                },
            },
        )
        self.assertEqual(candidate["policyStatus"], "blocked")
        self.assertTrue(candidate["policyViolations"])
        self.assertTrue(candidate["executionFailure"]["policyViolations"])

    def test_resolve_approval_blocks_and_discourages(self) -> None:
        run = {
            "id": "run1",
            "status": "awaiting_review",
            "policyViolations": ["forbidden path"],
            "artifacts": {
                "patch": "diff",
                "diffStat": "1 file",
                "changedFiles": [{"path": "a.ts", "additions": 1, "deletions": 0}],
                "artifactPaths": {"patchDiff": "/tmp/a.diff"},
                "validation": {"overallStatus": "passed", "commands": [], "notes": []},
                "qualityGates": {"gates": [], "recommendation": "review", "allPassed": False},
            },
        }
        candidate = {
            "id": "c1",
            "status": "review_ready",
            "runId": "run1",
            "reviewMetadata": {"policyViolations": ["forbidden path"], "prApprovalBlocked": True},
        }
        blocked = resolve_proactive_approval(candidate, run)
        self.assertEqual(blocked.action, "reject")

        warn_run = {
            **run,
            "policyViolations": [],
            "artifacts": {
                **run["artifacts"],
                "sandboxPolicy": {"sensitivePaths": ["src/auth/session.ts"]},
                "changedFiles": [{"path": "src/auth/session.ts", "additions": 1, "deletions": 0, "sensitive": True}],
            },
        }
        warn_candidate = attach_policy_visibility_to_candidate(
            {"id": "c2", "status": "review_ready", "runId": "run1", "reviewMetadata": {}},
            warn_run,
        )
        outcome = resolve_proactive_approval(warn_candidate, warn_run)
        self.assertEqual(outcome.action, "approved_internal")


if __name__ == "__main__":
    unittest.main()
