from __future__ import annotations

import sys
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from tests.proactive_test_harness import install_import_stubs

install_import_stubs()

import agent_runs  # noqa: E402
from proactive_deep_pipeline import ResearchBrief, generate_approaches  # noqa: E402

ISSUE = {"title": "Timer leak in useDashboard", "number": 7}
REPO_CONTEXT = {"repoAnalysis": {"primaryLanguage": "typescript"}}


def _brief() -> ResearchBrief:
    return ResearchBrief(
        target_file="src/hooks/useDashboard.ts",
        category="perf",
        summary="Targeting src/hooks/useDashboard.ts for a perf change.",
        related_files=["src/hooks/useTimer.ts"],
        existing_tests=["src/hooks/useDashboard.test.ts"],
    )


class GenerateDeepWorkApproachesTests(unittest.TestCase):
    def setUp(self) -> None:
        self._original = agent_runs.request_gemini_json

    def tearDown(self) -> None:
        agent_runs.request_gemini_json = self._original

    def _patch_gemini(self, fn) -> None:
        agent_runs.request_gemini_json = fn

    def test_uses_llm_approaches_when_response_is_well_formed(self) -> None:
        captured_prompts = []

        def fake(prompt, *args, **kwargs):
            captured_prompts.append(prompt)
            return {
                "approaches": [
                    {"title": "Clear the interval on unmount", "strategy": "lifecycle-guard",
                     "rationale": "Add a cleanup function to the effect.", "risk": "low"},
                    {"title": "Debounce the dashboard refresh", "strategy": "debounce-refresh",
                     "rationale": "Reduce refresh frequency to avoid overlapping timers.", "risk": "medium"},
                ]
            }

        self._patch_gemini(fake)
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, _brief(), REPO_CONTEXT, run_id="r1", project_id="p1")

        self.assertEqual(len(approaches), 2)
        self.assertEqual(approaches[0].title, "Clear the interval on unmount")
        self.assertEqual(approaches[0].id, "lifecycle-guard")
        self.assertEqual(approaches[0].risk, "low")
        self.assertGreater(approaches[0].score, approaches[1].score)  # best-first order preserved
        self.assertEqual(len(captured_prompts), 1)
        self.assertIn("useDashboard.ts", captured_prompts[0])

    def test_falls_back_to_template_catalog_when_no_api_key(self) -> None:
        self._patch_gemini(lambda *a, **k: None)  # matches request_gemini_json's real no-key behavior
        brief = _brief()
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, brief, REPO_CONTEXT)
        self.assertEqual(
            [a.id for a in approaches],
            [a.id for a in generate_approaches(ISSUE, brief)],
        )

    def test_falls_back_when_response_has_no_approaches_key(self) -> None:
        self._patch_gemini(lambda *a, **k: {"summary": "no approaches here"})
        brief = _brief()
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, brief, REPO_CONTEXT)
        self.assertEqual(
            [a.id for a in approaches],
            [a.id for a in generate_approaches(ISSUE, brief)],
        )

    def test_falls_back_when_entries_are_missing_titles(self) -> None:
        self._patch_gemini(lambda *a, **k: {"approaches": [{"strategy": "no-title"}, {"title": ""}]})
        brief = _brief()
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, brief, REPO_CONTEXT)
        self.assertEqual(
            [a.id for a in approaches],
            [a.id for a in generate_approaches(ISSUE, brief)],
        )

    def test_falls_back_on_exception(self) -> None:
        def boom(*args, **kwargs):
            raise RuntimeError("network exploded")

        self._patch_gemini(boom)
        brief = _brief()
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, brief, REPO_CONTEXT)
        self.assertEqual(
            [a.id for a in approaches],
            [a.id for a in generate_approaches(ISSUE, brief)],
        )

    def test_invalid_risk_defaults_to_medium(self) -> None:
        self._patch_gemini(lambda *a, **k: {"approaches": [
            {"title": "Odd risk value", "strategy": "odd-risk", "risk": "catastrophic"},
        ]})
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, _brief(), REPO_CONTEXT)
        self.assertEqual(approaches[0].risk, "medium")

    def test_duplicate_strategy_slugs_are_disambiguated(self) -> None:
        self._patch_gemini(lambda *a, **k: {"approaches": [
            {"title": "First", "strategy": "fix"},
            {"title": "Second", "strategy": "fix"},
        ]})
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, _brief(), REPO_CONTEXT)
        ids = [a.id for a in approaches]
        self.assertEqual(len(ids), len(set(ids)))

    def test_caps_at_four_approaches(self) -> None:
        self._patch_gemini(lambda *a, **k: {"approaches": [
            {"title": f"Approach {i}", "strategy": f"strategy-{i}"} for i in range(8)
        ]})
        approaches = agent_runs.generate_deep_work_approaches(ISSUE, _brief(), REPO_CONTEXT)
        self.assertLessEqual(len(approaches), 4)


if __name__ == "__main__":
    unittest.main()
