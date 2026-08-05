from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from tests.proactive_test_harness import install_import_stubs

install_import_stubs()

import opendevin_fallback  # noqa: E402
from opendevin_runner import OpenDevinAdapter, OpenDevinConfig, OpenDevinResult, OpenDevinRunner  # noqa: E402

ISSUE = {"title": "Fix timer leak", "number": 42, "body": "useDashboard leaks intervals"}


def _artifact_builders():
    return patch.multiple(
        "agent_runs",
        self_critique_patch=lambda *a, **k: {},
        evaluate_run=lambda *a, **k: {"confidenceScore": 0.8},
        build_quality_gates=lambda *a, **k: {"gates": []},
        build_test_matrix=lambda *a, **k: {"suites": []},
        build_change_intent=lambda *a, **k: {"tasks": []},
        build_pr_draft=lambda *a, **k: {"title": "Fix", "body": "body"},
        build_pr_readable=lambda *a, **k: {"title": "Fix", "sections": []},
        collect_diff_stat=lambda *a, **k: "+1 -0",
    )


class TryLegacyExecutorDeepPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.mkdtemp(prefix="legacy-deep-test-")
        self.workspace = Path(self._tmp)
        (self.workspace / "src").mkdir()
        (self.workspace / "src" / "app.ts").write_text("export const x = 1;\n", encoding="utf-8")

    def tearDown(self) -> None:
        import shutil

        shutil.rmtree(self._tmp, ignore_errors=True)

    def test_uses_deep_pipeline_when_run_resolves(self) -> None:
        with patch("agent_runs.collect_repo_context", return_value={"trackedFiles": ["src/app.ts"]}), \
             patch("agent_runs.build_execution_plan", return_value={"summary": "fix leak"}), \
             patch("agent_runs.read_run", return_value={"id": "run-1", "projectId": "proj-1", "timeline": []}), \
             patch("agent_runs.run_deep_work_pipeline") as mock_deep, \
             _artifact_builders():
            mock_deep.return_value = {
                "chosen": {
                    "patch": "diff --git a/src/app.ts",
                    "changedFiles": [{"path": "src/app.ts", "additions": 1, "deletions": 0}],
                    "validation": {"overallStatus": "passed", "commands": []},
                },
                "journey": {"version": 1, "stages": [], "prReady": True},
                "prReady": True,
            }
            result = opendevin_fallback.try_legacy_executor(
                self.workspace, ISSUE, run_id="run-1", project_id="proj-1",
            )

        mock_deep.assert_called_once()
        self.assertTrue(result.success)
        self.assertEqual(result.patch, "diff --git a/src/app.ts")
        self.assertIsNotNone(result.journey)
        self.assertTrue(result.pr_ready)

    def test_falls_back_to_single_pass_when_deep_returns_none(self) -> None:
        with patch("agent_runs.collect_repo_context", return_value={"trackedFiles": ["src/app.ts"]}), \
             patch("agent_runs.build_execution_plan", return_value={"summary": "fix leak"}), \
             patch("agent_runs.read_run", return_value={"id": "run-1", "timeline": []}), \
             patch("agent_runs.run_deep_work_pipeline", return_value=None) as mock_deep, \
             patch("agent_runs.build_change_set") as mock_change_set, \
             patch("agent_runs.apply_change_set") as mock_apply, \
             patch("agent_runs.collect_patch", return_value="diff content"), \
             patch("agent_runs.collect_changed_files", return_value=[{"path": "src/app.ts"}]), \
             patch("agent_runs.execute_validations", return_value={"overallStatus": "passed", "commands": []}), \
             _artifact_builders():
            mock_change_set.return_value = {
                "changes": [{"path": "src/app.ts", "action": "replace", "content": "x"}],
            }
            result = opendevin_fallback.try_legacy_executor(self.workspace, ISSUE, run_id="run-1")

        mock_deep.assert_called_once()
        mock_change_set.assert_called_once()
        mock_apply.assert_called_once()
        self.assertTrue(result.success)
        self.assertEqual(result.patch, "diff content")
        self.assertIsNone(result.journey)

    def test_skips_deep_pipeline_without_linked_run(self) -> None:
        with patch("agent_runs.collect_repo_context", return_value={"trackedFiles": ["src/app.ts"]}), \
             patch("agent_runs.build_execution_plan", return_value={"summary": "fix leak"}), \
             patch("agent_runs.run_deep_work_pipeline") as mock_deep, \
             patch("agent_runs.build_change_set") as mock_change_set, \
             patch("agent_runs.apply_change_set"), \
             patch("agent_runs.collect_patch", return_value="diff content"), \
             patch("agent_runs.collect_changed_files", return_value=[{"path": "src/app.ts"}]), \
             patch("agent_runs.execute_validations", return_value={"overallStatus": "passed", "commands": []}), \
             _artifact_builders():
            mock_change_set.return_value = {
                "changes": [{"path": "src/app.ts", "action": "replace", "content": "x"}],
            }
            result = opendevin_fallback.try_legacy_executor(self.workspace, ISSUE)

        mock_deep.assert_not_called()
        mock_change_set.assert_called_once()
        self.assertTrue(result.success)


class OpenDevinRunnerLegacyGuardTests(unittest.TestCase):
    def test_legacy_path_skips_revalidation(self) -> None:
        config = OpenDevinConfig(workspace_path="/tmp/ws", run_id="run-1", project_id="p1")
        runner = OpenDevinRunner(config)

        with patch.object(runner, "_execute_opendevin", return_value={"legacy": True}), \
             patch.object(runner, "_apply_legacy_result") as mock_apply, \
             patch.object(runner, "_collect_diff_artifacts") as mock_collect, \
             patch.object(runner, "_run_validations") as mock_validate, \
             patch.object(runner, "_build_evaluation") as mock_eval, \
             patch.object(runner, "_build_pr_artifacts") as mock_pr, \
             patch.object(runner, "_build_change_intent") as mock_intent:
            mock_apply.side_effect = lambda r: setattr(runner.result, "patch", "diff")
            runner.run(ISSUE)

        mock_collect.assert_not_called()
        mock_validate.assert_not_called()
        mock_eval.assert_not_called()
        mock_pr.assert_not_called()
        mock_intent.assert_not_called()


class ApplyResultToRunJourneyTests(unittest.TestCase):
    def test_copies_journey_and_pr_ready(self) -> None:
        result = OpenDevinResult()
        result.patch = "diff"
        result.journey = {"version": 1, "stages": [{"key": "research"}]}
        result.pr_ready = True

        run = {"artifacts": {}, "timeline": []}
        updated = OpenDevinAdapter.apply_result_to_run(run, result)

        self.assertEqual(updated["artifacts"]["journey"]["version"], 1)
        self.assertTrue(updated["artifacts"]["prReady"])


if __name__ == "__main__":
    unittest.main()
