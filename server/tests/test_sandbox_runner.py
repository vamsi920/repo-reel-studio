from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parents[1]
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

import sandbox_runner as sr  # noqa: E402

RUN_SUBPROCESS_SHAPE = {"command", "exitCode", "stdout", "stderr", "durationMs"}

HAVE_DOCKER = shutil.which("docker") is not None


def _docker_daemon_up() -> bool:
    if not HAVE_DOCKER:
        return False
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


HAVE_DOCKER_DAEMON = _docker_daemon_up()


class ModeResolutionTests(unittest.TestCase):
    def test_defaults_to_auto(self) -> None:
        with patch.dict("os.environ", {}, clear=False):
            import os

            os.environ.pop("AGENT_SANDBOX_MODE", None)
            self.assertEqual(sr.resolve_sandbox_mode(), "auto")

    def test_explicit_local(self) -> None:
        with patch.dict("os.environ", {"AGENT_SANDBOX_MODE": "local"}):
            self.assertEqual(sr.resolve_sandbox_mode(), "local")

    def test_explicit_docker(self) -> None:
        with patch.dict("os.environ", {"AGENT_SANDBOX_MODE": "docker"}):
            self.assertEqual(sr.resolve_sandbox_mode(), "docker")

    def test_unknown_value_falls_back_to_auto(self) -> None:
        with patch.dict("os.environ", {"AGENT_SANDBOX_MODE": "nonsense"}):
            self.assertEqual(sr.resolve_sandbox_mode(), "auto")


class DockerAvailableTests(unittest.TestCase):
    def test_returns_false_when_docker_binary_missing(self) -> None:
        with patch("sandbox_runner.subprocess.run", side_effect=FileNotFoundError()):
            self.assertFalse(sr.docker_available())

    def test_returns_false_on_timeout(self) -> None:
        with patch("sandbox_runner.subprocess.run", side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=5)):
            self.assertFalse(sr.docker_available())

    def test_returns_true_on_zero_exit(self) -> None:
        completed = subprocess.CompletedProcess(args=["docker", "info"], returncode=0)
        with patch("sandbox_runner.subprocess.run", return_value=completed):
            self.assertTrue(sr.docker_available())


class CreateSandboxDegradationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.mkdtemp(prefix="sandbox-runner-test-")
        self.addCleanup(shutil.rmtree, self._tmp, ignore_errors=True)
        self.addCleanup(lambda: sr.unregister_sandbox(self._tmp))

    def test_local_mode_never_touches_docker(self) -> None:
        with patch("sandbox_runner.subprocess.run", side_effect=AssertionError("should not shell out in local mode")):
            handle = sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag=None, mode="local")
        self.assertEqual(handle.mode, "local")
        self.assertIsNone(handle.container_id)
        self.assertIs(sr.get_sandbox(self._tmp), handle)

    def test_auto_mode_downgrades_when_docker_unavailable(self) -> None:
        with patch("sandbox_runner.docker_available", return_value=False):
            handle = sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag="some/image:tag", mode="auto")
        self.assertEqual(handle.mode, "local")

    def test_auto_mode_downgrades_without_image_tag(self) -> None:
        with patch("sandbox_runner.docker_available", return_value=True):
            handle = sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag=None, mode="auto")
        self.assertEqual(handle.mode, "local")

    def test_docker_mode_downgrades_on_start_failure(self) -> None:
        with patch("sandbox_runner.docker_available", return_value=True), \
             patch("sandbox_runner._start_container", return_value=None):
            handle = sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag="some/image:tag", mode="docker")
        self.assertEqual(handle.mode, "local")

    def test_require_docker_raises_instead_of_downgrading(self) -> None:
        with patch.dict("os.environ", {"AGENT_SANDBOX_REQUIRE_DOCKER": "1"}), \
             patch("sandbox_runner.docker_available", return_value=False):
            with self.assertRaises(RuntimeError):
                sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag="some/image:tag", mode="docker")

    def test_docker_mode_registers_container_handle(self) -> None:
        with patch("sandbox_runner.docker_available", return_value=True), \
             patch("sandbox_runner._start_container", return_value="abc123"):
            handle = sr.create_sandbox(uuid.uuid4().hex, self._tmp, image_tag="some/image:tag", mode="docker")
        self.assertEqual(handle.mode, "docker")
        self.assertEqual(handle.container_id, "abc123")
        self.assertEqual(sr.get_sandbox(self._tmp), handle)


class RunInSandboxShapeTests(unittest.TestCase):
    """Regression guard: run_in_sandbox must return the exact dict shape
    agent_runs.run_subprocess already returns, for every existing call site to
    keep working unmodified."""

    def test_local_handle_shape(self) -> None:
        handle = sr.SandboxHandle(run_id="r1", workspace_path=".", mode="local")
        result = sr.run_in_sandbox(handle, ["echo", "hi"], timeout_seconds=10)
        self.assertEqual(set(result.keys()), RUN_SUBPROCESS_SHAPE)
        self.assertEqual(result["exitCode"], 0)
        self.assertIn("hi", result["stdout"])

    def test_local_handle_timeout_shape(self) -> None:
        handle = sr.SandboxHandle(run_id="r1", workspace_path=".", mode="local")
        result = sr.run_in_sandbox(handle, ["sleep", "5"], timeout_seconds=1)
        self.assertEqual(set(result.keys()), RUN_SUBPROCESS_SHAPE)
        self.assertEqual(result["exitCode"], 124)

    def test_docker_exec_shape_is_mocked_correctly(self) -> None:
        handle = sr.SandboxHandle(run_id="r1", workspace_path=".", mode="docker", container_id="abc123", image_tag="x")
        completed = subprocess.CompletedProcess(args=["docker", "exec"], returncode=0, stdout="ok\n", stderr="")
        with patch("sandbox_runner.subprocess.run", return_value=completed) as mock_run:
            result = sr.run_in_sandbox(handle, ["echo", "ok"], timeout_seconds=10)
        self.assertEqual(set(result.keys()), RUN_SUBPROCESS_SHAPE)
        self.assertEqual(result["exitCode"], 0)
        called_cmd = mock_run.call_args[0][0]
        self.assertEqual(called_cmd[0:2], ["docker", "exec"])
        self.assertIn("abc123", called_cmd)


class DestroySandboxTests(unittest.TestCase):
    def test_local_handle_is_a_noop(self) -> None:
        with patch("sandbox_runner.subprocess.run", side_effect=AssertionError("should not shell out for local handles")):
            sr.register_sandbox("/tmp/some-workspace", sr.SandboxHandle(run_id="r1", workspace_path="/tmp/some-workspace", mode="local"))
            sr.destroy_sandbox("/tmp/some-workspace")
        self.assertIsNone(sr.get_sandbox("/tmp/some-workspace"))

    def test_docker_handle_calls_rm(self) -> None:
        sr.register_sandbox("/tmp/other-workspace", sr.SandboxHandle(run_id="r1", workspace_path="/tmp/other-workspace", mode="docker", container_id="abc123"))
        completed = subprocess.CompletedProcess(args=["docker", "rm"], returncode=0)
        with patch("sandbox_runner.subprocess.run", return_value=completed) as mock_run:
            sr.destroy_sandbox("/tmp/other-workspace")
        mock_run.assert_called_once()
        self.assertIn("abc123", mock_run.call_args[0][0])
        self.assertIsNone(sr.get_sandbox("/tmp/other-workspace"))

    def test_idempotent_when_already_destroyed(self) -> None:
        # Should not raise even though nothing is registered.
        sr.destroy_sandbox("/tmp/never-registered-workspace")


@unittest.skipUnless(HAVE_DOCKER_DAEMON, "requires a running Docker daemon")
class DockerIsolationTests(unittest.TestCase):
    """End-to-end isolation checks against a real container. Uses a tiny
    always-available base image rather than env_builder's generated images, to
    keep this test independent of repo-stack detection."""

    IMAGE = "alpine:3.19"

    def setUp(self) -> None:
        pull = subprocess.run(["docker", "image", "inspect", self.IMAGE], capture_output=True, timeout=30)
        if pull.returncode != 0:
            subprocess.run(["docker", "pull", self.IMAGE], capture_output=True, timeout=120)
        # Bind mounts must live under a path the Docker backend actually shares
        # into its VM. Docker Desktop shares most of the filesystem, but
        # colima (used on this machine) only shares $HOME by default — the
        # system temp dir (macOS: /var/folders/...) is invisible to it. Real
        # workspaces are always under server/.agent-runs/, which is under
        # $HOME, so this mirrors production rather than system tempfile.
        sandbox_tmp_root = SERVER_DIR / ".sandbox-test-tmp"
        sandbox_tmp_root.mkdir(exist_ok=True)
        self._tmp = tempfile.mkdtemp(prefix="e2e-", dir=str(sandbox_tmp_root))
        self.addCleanup(shutil.rmtree, self._tmp, ignore_errors=True)
        self.run_id = uuid.uuid4().hex
        self.handle = sr.create_sandbox(self.run_id, self._tmp, self.IMAGE, mode="docker")
        self.addCleanup(sr.destroy_sandbox, self._tmp)

    def test_container_actually_started(self) -> None:
        self.assertEqual(self.handle.mode, "docker")
        self.assertIsNotNone(self.handle.container_id)

    def test_host_only_path_is_invisible_inside_container(self) -> None:
        # A real host path (under $HOME, so it's genuinely visible to the
        # Docker backend) that sits outside the bind-mounted workspace dir —
        # this proves container mount isolation, not just VM-sharing quirks.
        sandbox_tmp_root = SERVER_DIR / ".sandbox-test-tmp"
        sandbox_tmp_root.mkdir(exist_ok=True)
        sentinel = sandbox_tmp_root / f"host-sentinel-{uuid.uuid4().hex}"
        sentinel.write_text("host secret")
        self.addCleanup(sentinel.unlink, missing_ok=True)
        result = sr.run_in_sandbox(self.handle, ["cat", str(sentinel)], timeout_seconds=10)
        self.assertNotEqual(result["exitCode"], 0)

    def test_workspace_write_is_visible_on_host(self) -> None:
        result = sr.run_in_sandbox(self.handle, ["sh", "-c", "echo from-container > /workspace/marker.txt"], timeout_seconds=10)
        self.assertEqual(result["exitCode"], 0)
        marker = Path(self._tmp) / "marker.txt"
        self.assertTrue(marker.exists())
        self.assertIn("from-container", marker.read_text())

    def test_timeout_returns_124_and_container_is_cleaned_up_after_destroy(self) -> None:
        result = sr.run_in_sandbox(self.handle, ["sleep", "60"], timeout_seconds=2)
        self.assertEqual(result["exitCode"], 124)
        sr.destroy_sandbox(self._tmp)
        listing = subprocess.run(
            ["docker", "ps", "-aq", "--filter", f"label=neodevex.run_id={self.run_id}"],
            capture_output=True, text=True, timeout=10,
        )
        self.assertEqual(listing.stdout.strip(), "")


if __name__ == "__main__":
    unittest.main()
