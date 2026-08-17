from __future__ import annotations

import os
import threading
import unittest
from unittest.mock import patch

from tests.proactive_test_harness import PROJECT_ID, REPO_URL, ProactiveTempStoreMixin, install_import_stubs

install_import_stubs()

import proactive_scheduler as scheduler  # noqa: E402


class SchedulerIntervalTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prior = os.environ.get("PROACTIVE_SCHEDULER_INTERVAL_SECONDS")

    def tearDown(self) -> None:
        if self._prior is None:
            os.environ.pop("PROACTIVE_SCHEDULER_INTERVAL_SECONDS", None)
        else:
            os.environ["PROACTIVE_SCHEDULER_INTERVAL_SECONDS"] = self._prior

    def test_default_is_120(self) -> None:
        os.environ.pop("PROACTIVE_SCHEDULER_INTERVAL_SECONDS", None)
        self.assertEqual(scheduler.scheduler_interval_seconds(), 120)

    def test_clamps_below_minimum(self) -> None:
        os.environ["PROACTIVE_SCHEDULER_INTERVAL_SECONDS"] = "5"
        self.assertEqual(scheduler.scheduler_interval_seconds(), 30)

    def test_clamps_above_maximum(self) -> None:
        os.environ["PROACTIVE_SCHEDULER_INTERVAL_SECONDS"] = "999999"
        self.assertEqual(scheduler.scheduler_interval_seconds(), 3600)

    def test_invalid_value_falls_back_to_default(self) -> None:
        os.environ["PROACTIVE_SCHEDULER_INTERVAL_SECONDS"] = "not-a-number"
        self.assertEqual(scheduler.scheduler_interval_seconds(), 120)


class SchedulerEnabledTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prior = os.environ.get("PROACTIVE_SCHEDULER_ENABLED")

    def tearDown(self) -> None:
        if self._prior is None:
            os.environ.pop("PROACTIVE_SCHEDULER_ENABLED", None)
        else:
            os.environ["PROACTIVE_SCHEDULER_ENABLED"] = self._prior

    def test_default_is_enabled(self) -> None:
        os.environ.pop("PROACTIVE_SCHEDULER_ENABLED", None)
        self.assertTrue(scheduler.scheduler_enabled())

    def test_recognizes_falsey_values(self) -> None:
        for value in ("0", "false", "False", "no", "off"):
            os.environ["PROACTIVE_SCHEDULER_ENABLED"] = value
            self.assertFalse(scheduler.scheduler_enabled(), value)


class SchedulerTickTests(ProactiveTempStoreMixin):
    def test_dispatches_each_enabled_scope(self) -> None:
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": True})
        other_repo = "https://github.com/example/proactive-scheduler-second.git"
        self.store.update_config(other_repo, "second-project", {"enabled": True})

        calls: list[tuple[str, str | None]] = []

        def fake_dispatch_daily(repo_url: str, project_id: str | None = None, **_kwargs):
            calls.append((repo_url, project_id))
            return {"status": "complete"}

        with patch("proactive_orchestrator.dispatch_daily", side_effect=fake_dispatch_daily):
            results = scheduler.run_scheduler_tick()

        self.assertEqual(sorted(calls), sorted([(REPO_URL, PROJECT_ID), (other_repo, "second-project")]))
        self.assertEqual(len(results), 2)
        self.assertTrue(all(item["status"] == "complete" for item in results))

    def test_skips_disabled_scopes(self) -> None:
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": False})

        with patch("proactive_orchestrator.dispatch_daily") as dispatch_mock:
            results = scheduler.run_scheduler_tick()

        dispatch_mock.assert_not_called()
        self.assertEqual(results, [])

    def test_one_scope_failure_does_not_block_others(self) -> None:
        self.store.update_config(REPO_URL, PROJECT_ID, {"enabled": True})
        other_repo = "https://github.com/example/proactive-scheduler-third.git"
        self.store.update_config(other_repo, "third-project", {"enabled": True})

        def flaky_dispatch(repo_url: str, project_id: str | None = None, **_kwargs):
            if project_id == PROJECT_ID:
                raise RuntimeError("simulated dispatch failure")
            return {"status": "complete"}

        with patch("proactive_orchestrator.dispatch_daily", side_effect=flaky_dispatch):
            results = scheduler.run_scheduler_tick()

        self.assertEqual(len(results), 2)
        statuses = {item["scope"]["projectId"]: item["status"] for item in results}
        self.assertEqual(statuses[PROJECT_ID], "error")
        self.assertEqual(statuses["third-project"], "complete")


class ScheduleSingleDispatchTests(ProactiveTempStoreMixin):
    def test_fires_dispatch_daily_in_background_thread(self) -> None:
        done = threading.Event()
        seen: dict[str, object] = {}

        def fake_dispatch_daily(repo_url: str, repo_name=None, project_id=None, **_kwargs):
            seen["repo_url"] = repo_url
            seen["repo_name"] = repo_name
            seen["project_id"] = project_id
            done.set()
            return {"status": "complete"}

        with patch("proactive_orchestrator.dispatch_daily", side_effect=fake_dispatch_daily):
            scheduler.schedule_proactive_dispatch(REPO_URL, project_id=PROJECT_ID, repo_name="example")
            self.assertTrue(done.wait(timeout=5), "dispatch was not invoked within timeout")

        self.assertEqual(seen["repo_url"], REPO_URL)
        self.assertEqual(seen["repo_name"], "example")
        self.assertEqual(seen["project_id"], PROJECT_ID)

    def test_exception_in_background_dispatch_is_contained(self) -> None:
        done = threading.Event()

        def failing_dispatch(*_args, **_kwargs):
            done.set()
            raise RuntimeError("boom")

        with patch("proactive_orchestrator.dispatch_daily", side_effect=failing_dispatch):
            scheduler.schedule_proactive_dispatch(REPO_URL, project_id=PROJECT_ID)
            self.assertTrue(done.wait(timeout=5), "dispatch was not invoked within timeout")
        # No assertion beyond "the test process is still alive" — the background
        # thread must swallow the exception rather than crashing the process.


if __name__ == "__main__":
    unittest.main()
