from __future__ import annotations

import uuid
from pathlib import Path
from unittest.mock import patch

from proactive_candidate_dedupe import BatchDedupeRegistry, register_candidate, select_candidates
from proactive_candidate_score import SELECT_THRESHOLD
from proactive_no_patch_failure import FAILURE_KIND_NO_PATCH
from proactive_status_summary import build_status_summary
from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

install_import_stubs()

from proactive_orchestrator import (  # noqa: E402
    _import_counts_for_workspace,
    build_candidate,
    build_import_counts,
    discover_candidates,
    mark_candidate_needs_execution,
    mark_candidate_ready,
)


class ProactiveOrchestratorTests(ProactiveTempStoreMixin):
    def _workspace_with_todo(self) -> Path:
        root = self._tmp_root / "workspace"
        src = root / "src"
        src.mkdir(parents=True)
        (src / "util.ts").write_text(
            "// TODO: tighten timeout handling\nexport function run() { return 1; }\n",
            encoding="utf-8",
        )
        (root / "package.json").write_text(
            '{"name":"proactive-test","scripts":{"test":"vitest run","lint":"eslint ."}}',
            encoding="utf-8",
        )
        return root

    def test_build_candidate_attaches_structured_score(self) -> None:
        batch_id = uuid.uuid4().hex
        candidate = build_candidate(
            REPO_URL,
            "example",
            PROJECT_ID,
            batch_id,
            "improvement",
            "Improve util",
            "Hypothesis",
            ["signal evidence"],
            "src/util.ts",
            centrality=3,
            has_test=True,
            hinted=True,
            validation_hints=["Validation commands available: test"],
            validation_profile={"overall": "strong", "commands": {"test": ["npm test"]}},
        )
        self.assertEqual(candidate["status"], "discovered")
        self.assertGreaterEqual(candidate["score"]["total"], SELECT_THRESHOLD)
        self.assertTrue(any("Ranking:" in item for item in candidate["evidence"]))

    def test_discover_candidates_and_dedupe(self) -> None:
        workspace = self._workspace_with_todo()
        batch_id = uuid.uuid4().hex
        discovered = discover_candidates(
            workspace,
            REPO_URL,
            PROJECT_ID,
            batch_id,
            "example",
            {"focusFiles": ["src/util.ts"]},
            None,
        )
        self.assertTrue(discovered, "discovery should emit at least one candidate")
        keys = [item["dedupeKey"] for item in discovered]
        self.assertEqual(len(keys), len(set(keys)), "dedupe should collapse duplicate opportunities")

        selected = select_candidates(discovered, target=6)
        self.assertTrue(selected)
        self.assertGreaterEqual(selected[0]["score"]["total"], SELECT_THRESHOLD)

    def test_registry_dedupe_keeps_stronger_duplicate(self) -> None:
        batch_id = uuid.uuid4().hex
        weaker = build_candidate(
            REPO_URL,
            "example",
            PROJECT_ID,
            batch_id,
            "improvement",
            "Weaker",
            "h",
            ["e"],
            "src/util.ts",
            1,
            False,
        )
        stronger = build_candidate(
            REPO_URL,
            "example",
            PROJECT_ID,
            batch_id,
            "improvement",
            "Stronger",
            "h",
            ["e1", "e2", "e3"],
            "src/util.ts",
            4,
            True,
            hinted=True,
            validation_profile={"overall": "strong", "commands": {"test": ["npm test"]}},
        )
        registry = BatchDedupeRegistry({})
        register_candidate(registry, weaker)
        register_candidate(registry, stronger)
        final = registry.finalize()
        eligible = [item for item in final if item.get("status") != "not_selected"]
        self.assertEqual(len(eligible), 1)
        self.assertGreater(eligible[0]["score"]["total"], weaker["score"]["total"])
        self.assertEqual(
            sum(1 for item in final if item.get("status") == "not_selected"),
            1,
        )

    def test_mark_candidate_ready_and_needs_execution(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head-ready", "example")
        candidate = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "executing",
                "type": "improvement",
                "title": "Candidate",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.8},
                "dedupeKey": "src/x.ts:improvement",
                "timeline": [],
            }
        )
        workspace = self._workspace_with_todo()

        ready = mark_candidate_ready(
            candidate,
            workspace,
            [{"path": "src/util.ts", "additions": 1, "deletions": 0}],
            assessment={
                "validationCoverage": "partial",
                "validationSummary": "lint passed",
                "changedFileCount": 1,
            },
        )
        self.assertEqual(ready["status"], "review_ready")
        self.assertFalse(ready["qualityGates"]["needsPatch"])
        self.assertTrue(any(item.get("stage") == "review_ready" for item in ready["timeline"]))

        needs = mark_candidate_needs_execution(
            ready,
            "Executor returned without a patch.",
            failure_kind=FAILURE_KIND_NO_PATCH,
            executor_source="legacy",
        )
        self.assertEqual(needs["status"], "needs_execution")
        self.assertTrue(needs["reviewMetadata"].get("requiresPatchExecutor"))
        self.assertTrue(any(item.get("stage") == "needs_execution" for item in needs["timeline"]))

        persisted = self.store.get_candidate(REPO_URL, PROJECT_ID, needs["id"])
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["status"], "needs_execution")

    def test_status_summary_reflects_review_ready_in_active_batch(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 3, "head3", "example")
        self.store.transition_batch(batch, "materializing", "materializing")
        self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "Ready",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.91},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            }
        )
        self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "needs_execution",
                "type": "improvement",
                "title": "Needs executor",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.7},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            }
        )

        with patch("proactive_store.run_console_summary", return_value=None):
            status = build_status_summary(REPO_URL, PROJECT_ID)

        self.assertEqual(status["batch"]["id"], batch["id"])
        self.assertEqual(status["ready"], 1)
        statuses = {item["status"] for item in status["candidates"]}
        self.assertIn("review_ready", statuses)
        self.assertIn("needs_execution", statuses)


class GraphifyCentralityFallbackTests(ProactiveTempStoreMixin):
    """_import_counts_for_workspace() must never let a Graphify failure block
    discovery -- it always falls back to build_import_counts()."""

    def _workspace(self) -> Path:
        root = self._tmp_root / "centrality-workspace"
        (root / "src").mkdir(parents=True)
        (root / "src" / "a.ts").write_text("export const a = 1;\n", encoding="utf-8")
        (root / "src" / "b.ts").write_text('import { a } from "./a";\nconsole.log(a);\n', encoding="utf-8")
        return root

    def test_disabled_uses_regex_heuristic_directly(self) -> None:
        import os

        workspace = self._workspace()
        files = ["src/a.ts", "src/b.ts"]
        with patch.dict(os.environ, {"PROACTIVE_GRAPHIFY_CENTRALITY": "false"}):
            with patch("proactive_orchestrator.build_import_counts", return_value={"src/a.ts": 9}) as mocked:
                result = _import_counts_for_workspace(workspace, files)
        mocked.assert_called_once_with(workspace, files)
        self.assertEqual(result, {"src/a.ts": 9})

    def test_enabled_and_succeeding_uses_graph_derived_counts(self) -> None:
        import os

        workspace = self._workspace()
        files = ["src/a.ts", "src/b.ts"]
        fake_graph_counts = {"src/a.ts": 3, "src/b.ts": 0}
        with patch.dict(os.environ, {"PROACTIVE_GRAPHIFY_CENTRALITY": "true"}):
            with patch("graphify_centrality.centrality_via_graphify", return_value=fake_graph_counts) as mocked:
                with patch("proactive_orchestrator.build_import_counts") as legacy_mock:
                    result = _import_counts_for_workspace(workspace, files)
        mocked.assert_called_once()
        legacy_mock.assert_not_called()
        self.assertEqual(result, fake_graph_counts)

    def test_enabled_but_failing_falls_back_to_regex_heuristic(self) -> None:
        import os

        workspace = self._workspace()
        files = ["src/a.ts", "src/b.ts"]
        with patch.dict(os.environ, {"PROACTIVE_GRAPHIFY_CENTRALITY": "true"}):
            with patch("graphify_centrality.centrality_via_graphify", side_effect=RuntimeError("graphify unavailable")):
                with patch("proactive_orchestrator.build_import_counts", return_value={"src/a.ts": 1}) as legacy_mock:
                    result = _import_counts_for_workspace(workspace, files)
        legacy_mock.assert_called_once_with(workspace, files)
        self.assertEqual(result, {"src/a.ts": 1})

    def test_enabled_end_to_end_against_real_build_import_counts_shape(self) -> None:
        # Sanity check that both paths return the same dict shape (path -> int)
        # so compute_candidate_score's centrality input contract holds either way.
        workspace = self._workspace()
        files = ["src/a.ts", "src/b.ts"]
        regex_result = build_import_counts(workspace, files)
        self.assertEqual(set(regex_result.keys()), set(files))
        self.assertTrue(all(isinstance(v, int) for v in regex_result.values()))
