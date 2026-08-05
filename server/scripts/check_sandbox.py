#!/usr/bin/env python3
"""Manual/CI preflight for real container sandbox isolation.

Prints whether Docker is available, then does a scratch create_sandbox ->
run_in_sandbox -> destroy_sandbox round trip and reports pass/fail. Safe to
run on a machine without Docker (reports "skipped", exits 0) so it can sit in
CI unconditionally.

Usage: python3 server/scripts/check_sandbox.py
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER_DIR))

import sandbox_runner as sr  # noqa: E402

PROBE_IMAGE = "alpine:3.19"


def main() -> int:
    print(f"docker_available(): {sr.docker_available()}")

    if not sr.docker_available():
        print("Docker is not available on this machine — sandbox will fall back to the Local tier for real runs.")
        print("SKIPPED (not a failure; this is the expected dev-laptop-without-Docker path).")
        return 0

    pull = subprocess.run(["docker", "image", "inspect", PROBE_IMAGE], capture_output=True, timeout=30)
    if pull.returncode != 0:
        print(f"Pulling probe image {PROBE_IMAGE} ...")
        subprocess.run(["docker", "pull", PROBE_IMAGE], timeout=120)

    tmp_dir = tempfile.mkdtemp(prefix="sandbox-runner-preflight-")
    run_id = uuid.uuid4().hex
    try:
        handle = sr.create_sandbox(run_id, tmp_dir, PROBE_IMAGE, mode="docker")
        if handle.mode != "docker":
            print(f"FAIL: create_sandbox downgraded to '{handle.mode}' instead of starting a container.")
            return 1
        print(f"Container started: {handle.container_id}")

        result = sr.run_in_sandbox(handle, ["echo", "ok"], timeout_seconds=10)
        if result["exitCode"] != 0 or "ok" not in result["stdout"]:
            print(f"FAIL: run_in_sandbox returned unexpected result: {result}")
            return 1
        print(f"run_in_sandbox: exitCode={result['exitCode']} stdout={result['stdout'].strip()!r}")

        sr.destroy_sandbox(tmp_dir)
        listing = subprocess.run(
            ["docker", "ps", "-aq", "--filter", f"label=neodevex.run_id={run_id}"],
            capture_output=True, text=True, timeout=10,
        )
        if listing.stdout.strip():
            print(f"FAIL: container {listing.stdout.strip()} still present after destroy_sandbox.")
            return 1
        print("destroy_sandbox: container removed.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    print("PASS: sandbox_runner round trip succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
