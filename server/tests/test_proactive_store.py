from __future__ import annotations

import uuid

from proactive_candidate_score import SELECT_THRESHOLD
from proactive_status_summary import build_status_summary, resolve_status_batch
from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin


class ProactiveStoreTests(ProactiveTempStoreMixin):
    def test_config_defaults_and_patch(self) -> None:
        cfg = self.store.get_config(REPO_URL, PROJECT_ID)
        self.assertFalse(cfg["enabled"])
        self.assertEqual(cfg["targetCount"], 6)

        updated = self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": True, "targetCount": 4})
        self.assertTrue(updated["enabled"])
        self.assertEqual(updated["targetCount"], 4)

    def test_batch_lifecycle_and_active_resolution(self) -> None:
        older = self.store.create_batch(REPO_URL, PROJECT_ID, 4, "abc111", "example")
        older["createdAt"] = "2026-01-01T00:00:00Z"
        older["updatedAt"] = "2026-01-01T00:00:00Z"
        self.store.update_batch(older)
        self.store.transition_batch(older, "complete", "older batch done")

        newer = self.store.create_batch(REPO_URL, PROJECT_ID, 4, "def222", "example")
        self.store.transition_batch(newer, "discovering", "scanning")

        active = self.store.find_active_batch(REPO_URL, PROJECT_ID)
        self.assertIsNotNone(active)
        self.assertEqual(active["id"], newer["id"])

        resolved = resolve_status_batch(REPO_URL, PROJECT_ID)
        self.assertEqual(resolved["id"], newer["id"])

    def test_candidate_list_progress_and_find(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 3, "head1", "example")
        low = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "discovered",
                "type": "bug",
                "title": "Low",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.2},
                "dedupeKey": "a:bug",
            }
        )
        high = self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "High",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.95},
                "dedupeKey": "b:improvement",
            }
        )

        listed = self.store.list_candidates(REPO_URL, PROJECT_ID, batch["id"])
        self.assertEqual(listed[0]["id"], high["id"])
        self.assertEqual(listed[1]["id"], low["id"])

        progress = self.store.batch_progress_from_candidates(
            self.store.list_candidates(REPO_URL, PROJECT_ID, batch["id"], include_dismissed=True)
        )
        self.assertEqual(progress["ready"], 1)
        self.assertEqual(progress["discovered"], 2)

        found = self.store.find_candidate(high["id"])
        self.assertIsNotNone(found)
        self.assertEqual(found["id"], high["id"])

    def test_summarize_status_shape_and_ready_count(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 2, "head2", "example")
        self.store.create_candidate(
            {
                "batchId": batch["id"],
                "repoUrl": REPO_URL,
                "projectId": PROJECT_ID,
                "status": "review_ready",
                "type": "improvement",
                "title": "Ready one",
                "hypothesis": "h",
                "evidence": [],
                "score": {"total": 0.9},
                "dedupeKey": f"{uuid.uuid4().hex}:improvement",
            }
        )
        self.store.transition_batch(batch, "complete", "done")

        status = build_status_summary(
            REPO_URL,
            PROJECT_ID,
            enrich_fn=lambda items: [{**item, "linkedRun": None} for item in items],
        )
        for key in ("config", "batch", "ready", "target", "candidates", "shortfallReason"):
            self.assertIn(key, status)
        self.assertEqual(status["ready"], 1)
        self.assertEqual(status["target"], 2)
        self.assertLessEqual(len(status["candidates"]), 6)
        self.assertTrue(all("linkedRun" in item for item in status["candidates"]))

    def test_idempotent_complete_batch_reuse(self) -> None:
        batch = self.store.create_batch(REPO_URL, PROJECT_ID, 3, "same-head", "example")
        self.store.transition_batch(batch, "complete", "done")
        reused = self.store.find_reusable_complete_batch(REPO_URL, PROJECT_ID, "same-head", day=batch["date"])
        self.assertIsNotNone(reused)
        self.assertEqual(reused["id"], batch["id"])


class ProactiveScoringDedupeTests(ProactiveTempStoreMixin):
    def test_select_threshold_filters_weak_candidates(self) -> None:
        from proactive_candidate_dedupe import select_candidates

        weak = {
            "id": "weak",
            "dedupeKey": "src/a.ts:improvement",
            "score": {"total": SELECT_THRESHOLD - 0.1},
            "evidence": [],
        }
        strong = {
            "id": "strong",
            "dedupeKey": "src/b.ts:improvement",
            "score": {"total": SELECT_THRESHOLD + 0.1},
            "evidence": [],
        }
        selected = select_candidates([weak, strong], target=6)
        self.assertEqual(len(selected), 1)
        self.assertEqual(selected[0]["id"], "strong")
