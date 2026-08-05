"""SandboxRunner: real per-run container isolation for patch/test execution.

Wraps env_builder's cached Docker images so each Agent Ops / proactive run gets
a genuinely isolated container (bind-mounted workspace, capped memory/cpu)
instead of running validation subprocesses directly on the host. Every entry
point degrades to today's host-subprocess behavior ("local" mode) whenever
Docker isn't available, isn't requested, or fails to start — this module never
raises out of create_sandbox/run_in_sandbox/destroy_sandbox, so it is always a
safe drop-in for agent_runs.run_subprocess.
"""
from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

SANDBOX_LABEL = "neodevex.sandbox=1"


@dataclass
class SandboxHandle:
    run_id: str
    workspace_path: str
    mode: str  # "local" | "docker"
    container_id: Optional[str] = None
    image_tag: Optional[str] = None


_ACTIVE: dict[str, SandboxHandle] = {}
_LOCK = threading.Lock()


def resolve_sandbox_mode() -> str:
    value = os.getenv("AGENT_SANDBOX_MODE", "auto").strip().lower()
    return value if value in ("local", "docker", "auto") else "auto"


def docker_available() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


def ensure_image_for_workspace(
    project_id: Optional[str],
    workspace_path: str,
    repo_url: str,
) -> Optional[str]:
    """Reuse env_builder's cached image for this project, building on demand if needed.

    Never raises — any failure (no project id, no docker, build failure) returns
    None so callers fall back to the Local tier.
    """
    if not project_id:
        return None
    try:
        import env_builder

        artifacts = env_builder.load_env_artifacts(str(project_id))
        image_info = (artifacts or {}).get("image") or {}
        image_tag = image_info.get("image_tag")
        if image_tag and image_info.get("status") in ("built", "cached"):
            return image_tag

        result = env_builder.build_env_image(
            workspace_path=workspace_path,
            project_id=str(project_id),
            repo_url=repo_url or "",
        )
        if result.get("status") in ("built", "cached"):
            return result.get("image_tag")
        return None
    except Exception:
        return None


def register_sandbox(workspace_path: str, handle: SandboxHandle) -> None:
    with _LOCK:
        _ACTIVE[workspace_path] = handle


def get_sandbox(workspace_path: str) -> Optional[SandboxHandle]:
    with _LOCK:
        return _ACTIVE.get(workspace_path)


def unregister_sandbox(workspace_path: str) -> Optional[SandboxHandle]:
    with _LOCK:
        return _ACTIVE.pop(workspace_path, None)


def create_sandbox(
    run_id: str,
    workspace_path: str,
    image_tag: Optional[str],
    *,
    mode: Optional[str] = None,
) -> SandboxHandle:
    """Create (and register) a sandbox for this workspace.

    Never raises unless AGENT_SANDBOX_REQUIRE_DOCKER is set and Docker isolation
    genuinely cannot be provided — otherwise any Docker failure downgrades to a
    Local handle so the run proceeds exactly as it does today.
    """
    resolved_mode = mode or resolve_sandbox_mode()
    require_docker = os.getenv("AGENT_SANDBOX_REQUIRE_DOCKER", "").strip().lower() in ("1", "true", "yes")

    def _local() -> SandboxHandle:
        handle = SandboxHandle(run_id=run_id, workspace_path=workspace_path, mode="local")
        register_sandbox(workspace_path, handle)
        return handle

    if resolved_mode == "local":
        return _local()

    if not image_tag or not docker_available():
        if require_docker and resolved_mode == "docker":
            raise RuntimeError(
                "AGENT_SANDBOX_REQUIRE_DOCKER is set but Docker (or a usable image) is unavailable"
            )
        return _local()

    container_id = _start_container(workspace_path, image_tag, run_id)
    if container_id is None:
        if require_docker and resolved_mode == "docker":
            raise RuntimeError("AGENT_SANDBOX_REQUIRE_DOCKER is set but the sandbox container failed to start")
        return _local()

    handle = SandboxHandle(
        run_id=run_id,
        workspace_path=workspace_path,
        mode="docker",
        container_id=container_id,
        image_tag=image_tag,
    )
    register_sandbox(workspace_path, handle)
    return handle


def _start_container(workspace_path: str, image_tag: str, run_id: str) -> Optional[str]:
    abs_workspace = str(Path(workspace_path).resolve())
    memory = os.getenv("AGENT_SANDBOX_MEMORY", "2g")
    cpus = os.getenv("AGENT_SANDBOX_CPUS", "2")
    try:
        result = subprocess.run(
            [
                "docker", "run", "-d", "--rm",
                "--label", SANDBOX_LABEL,
                "--label", f"neodevex.run_id={run_id}",
                "-v", f"{abs_workspace}:/workspace:rw",
                "-w", "/workspace",
                "--memory", memory,
                "--cpus", cpus,
                image_tag,
                "sleep", "infinity",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            return None
        return result.stdout.strip() or None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


def run_in_sandbox(
    handle: SandboxHandle,
    command: list[str],
    *,
    timeout_seconds: int,
) -> dict[str, Any]:
    """Run `command` inside the sandbox.

    Returns the exact same shape agent_runs.run_subprocess already returns
    (command/exitCode/stdout/stderr/durationMs), so this is a true drop-in for
    every existing call site.
    """
    started = time.time()

    if handle.mode != "docker" or not handle.container_id:
        return _run_local(command, handle.workspace_path, timeout_seconds, started)

    exec_cmd = [
        "docker", "exec",
        "-e", "CI=1",
        "-e", "GIT_TERMINAL_PROMPT=0",
        "-w", "/workspace",
        handle.container_id,
        *command,
    ]

    try:
        completed = subprocess.run(exec_cmd, capture_output=True, text=True, timeout=timeout_seconds, check=False)
        return {
            "command": " ".join(command),
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-20000:],
            "stderr": (completed.stderr or "")[-20000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        try:
            subprocess.run(
                ["docker", "exec", handle.container_id, "pkill", "-f", " ".join(command)],
                capture_output=True,
                timeout=10,
            )
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass
        return {
            "command": " ".join(command),
            "exitCode": 124,
            "stdout": (exc.stdout or "")[-20000:] if isinstance(exc.stdout, str) else "",
            "stderr": ((exc.stderr or "")[-20000:] if isinstance(exc.stderr, str) else "") or f"Timed out after {timeout_seconds}s",
            "durationMs": int((time.time() - started) * 1000),
        }


def _run_local(command: list[str], cwd: str, timeout_seconds: int, started: float) -> dict[str, Any]:
    env = os.environ.copy()
    env["CI"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        completed = subprocess.run(
            command, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout_seconds, check=False,
        )
        return {
            "command": " ".join(command),
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-20000:],
            "stderr": (completed.stderr or "")[-20000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "command": " ".join(command),
            "exitCode": 124,
            "stdout": (exc.stdout or "")[-20000:] if isinstance(exc.stdout, str) else "",
            "stderr": ((exc.stderr or "")[-20000:] if isinstance(exc.stderr, str) else "") or f"Timed out after {timeout_seconds}s",
            "durationMs": int((time.time() - started) * 1000),
        }


def destroy_sandbox(workspace_path: str) -> None:
    handle = unregister_sandbox(workspace_path)
    if not handle or handle.mode != "docker" or not handle.container_id:
        return
    try:
        subprocess.run(["docker", "rm", "-f", handle.container_id], capture_output=True, timeout=15)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        pass


def sweep_orphaned_sandboxes() -> int:
    """Force-remove any containers left over from a hard process crash.

    Called once at process startup (see agent_runs_app.py / ingestion-server.py
    lifespans). Returns the number of containers removed.
    """
    try:
        listing = subprocess.run(
            ["docker", "ps", "-aq", "--filter", f"label={SANDBOX_LABEL}"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return 0
    if listing.returncode != 0:
        return 0
    container_ids = [cid for cid in listing.stdout.split() if cid]
    if not container_ids:
        return 0
    try:
        subprocess.run(["docker", "rm", "-f", *container_ids], capture_output=True, timeout=30)
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return 0
    return len(container_ids)
