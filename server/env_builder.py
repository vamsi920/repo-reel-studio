"""
EnvBuilder: detect repo stack, generate build recipe, build/cache Docker image.

Called during ingestion (after repo is cached) to produce an "Agent Ready" 
sandbox environment for future BugBot runs.
"""
from __future__ import annotations

import json
import hashlib
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

REPO_WORKSPACES_ROOT = Path(__file__).resolve().parent / ".repo-workspaces"
ENV_ARTIFACTS_DIR = "env-artifacts"


# ---------------------------------------------------------------------------
# Stack detection
# ---------------------------------------------------------------------------

STACK_DETECTORS = {
    "node": {
        "indicators": ["package.json"],
        "package_managers": {
            "pnpm-lock.yaml": "pnpm",
            "yarn.lock": "yarn",
            "bun.lockb": "bun",
            "package-lock.json": "npm",
        },
        "test_commands": ["npm test", "npx vitest run", "npx jest --passWithNoTests"],
        "lint_commands": ["npm run lint --if-present"],
        "build_commands": ["npm run build --if-present"],
        "install_command_map": {
            "npm": "npm ci --ignore-scripts || npm install",
            "yarn": "yarn install --frozen-lockfile || yarn install",
            "pnpm": "pnpm install --frozen-lockfile || pnpm install",
            "bun": "bun install",
        },
    },
    "python": {
        "indicators": ["requirements.txt", "setup.py", "pyproject.toml", "Pipfile"],
        "package_managers": {
            "Pipfile.lock": "pipenv",
            "poetry.lock": "poetry",
            "uv.lock": "uv",
            "requirements.txt": "pip",
        },
        "test_commands": ["pytest --tb=short -q", "python -m pytest --tb=short -q"],
        "lint_commands": ["ruff check . || true", "mypy . --ignore-missing-imports || true"],
        "build_commands": [],
        "install_command_map": {
            "pip": "pip install -r requirements.txt",
            "pipenv": "pipenv install --deploy || pipenv install",
            "poetry": "poetry install --no-interaction",
            "uv": "uv sync || uv pip install -r requirements.txt",
        },
    },
    "go": {
        "indicators": ["go.mod"],
        "package_managers": {"go.sum": "go"},
        "test_commands": ["go test ./..."],
        "lint_commands": ["golangci-lint run || true"],
        "build_commands": ["go build ./..."],
        "install_command_map": {"go": "go mod download"},
    },
    "rust": {
        "indicators": ["Cargo.toml"],
        "package_managers": {"Cargo.lock": "cargo"},
        "test_commands": ["cargo test"],
        "lint_commands": ["cargo clippy -- -D warnings || true"],
        "build_commands": ["cargo build"],
        "install_command_map": {"cargo": "cargo fetch"},
    },
}

BASE_IMAGES = {
    "node": "node:20-slim",
    "python": "python:3.12-slim",
    "go": "golang:1.22-bookworm",
    "rust": "rust:1.78-slim",
}


def detect_stack(workspace_path: str) -> dict[str, Any]:
    """Detect languages, package manager, and baseline commands for a repo."""
    ws = Path(workspace_path)
    detected: dict[str, Any] = {
        "languages": [],
        "primary_language": None,
        "package_manager": None,
        "install_command": None,
        "test_commands": [],
        "lint_commands": [],
        "build_commands": [],
        "has_devcontainer": False,
        "devcontainer_path": None,
    }

    # Check for devcontainer
    devcontainer_paths = [
        ws / ".devcontainer" / "devcontainer.json",
        ws / ".devcontainer.json",
    ]
    for dc_path in devcontainer_paths:
        if dc_path.exists():
            detected["has_devcontainer"] = True
            detected["devcontainer_path"] = str(dc_path.relative_to(ws))
            break

    # Detect each language stack
    for lang, config in STACK_DETECTORS.items():
        has_indicator = any((ws / ind).exists() for ind in config["indicators"])
        if not has_indicator:
            continue

        detected["languages"].append(lang)

        # Detect package manager
        pm = None
        for lockfile, pm_name in config["package_managers"].items():
            if (ws / lockfile).exists():
                pm = pm_name
                break
        if pm is None:
            # Fallback to first indicator-based default
            pm = list(config["package_managers"].values())[-1] if config["package_managers"] else None

        if detected["primary_language"] is None:
            detected["primary_language"] = lang
            detected["package_manager"] = pm
            detected["install_command"] = config["install_command_map"].get(pm, "")
            detected["test_commands"] = config["test_commands"]
            detected["lint_commands"] = config["lint_commands"]
            detected["build_commands"] = config["build_commands"]

    # If no language detected, default to generic
    if not detected["languages"]:
        detected["languages"] = ["unknown"]
        detected["primary_language"] = "unknown"

    return detected


def generate_dockerfile(stack_info: dict[str, Any], workspace_path: str) -> str:
    """Generate a Dockerfile for the detected stack."""
    lang = stack_info.get("primary_language", "unknown")
    base_image = BASE_IMAGES.get(lang, "ubuntu:22.04")
    install_cmd = stack_info.get("install_command", "")

    lines = [
        f"FROM {base_image}",
        "",
        "RUN apt-get update && apt-get install -y --no-install-recommends \\",
        "    git curl ca-certificates && \\",
        "    rm -rf /var/lib/apt/lists/*",
        "",
        "WORKDIR /workspace",
        "",
        "# Copy dependency files first for layer caching",
    ]

    # Copy lockfiles/manifests for caching
    ws = Path(workspace_path)
    if lang == "node":
        lines.append("COPY package*.json ./")
        if (ws / "pnpm-lock.yaml").exists():
            lines.append("COPY pnpm-lock.yaml ./")
        if (ws / "yarn.lock").exists():
            lines.append("COPY yarn.lock ./")
    elif lang == "python":
        if (ws / "requirements.txt").exists():
            lines.append("COPY requirements.txt ./")
        if (ws / "pyproject.toml").exists():
            lines.append("COPY pyproject.toml ./")
            if (ws / "poetry.lock").exists():
                lines.append("COPY poetry.lock ./")
    elif lang == "go":
        lines.append("COPY go.mod go.sum ./")
    elif lang == "rust":
        lines.append("COPY Cargo.toml Cargo.lock ./")

    lines.append("")

    # Install dependencies
    if install_cmd:
        lines.append(f"RUN {install_cmd}")
        lines.append("")

    # Copy rest of source
    lines.append("COPY . .")
    lines.append("")

    # Default command
    lines.append('CMD ["sleep", "infinity"]')
    lines.append("")

    return "\n".join(lines)


def compute_env_fingerprint(workspace_path: str, stack_info: dict[str, Any]) -> str:
    """Compute a fingerprint based on lockfiles and stack detection."""
    ws = Path(workspace_path)
    hasher = hashlib.sha256()

    # Hash the detected stack info
    hasher.update(json.dumps(stack_info, sort_keys=True).encode())

    # Hash key lockfiles
    lockfiles = [
        "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
        "requirements.txt", "Pipfile.lock", "poetry.lock",
        "go.sum", "Cargo.lock",
    ]
    for lf in lockfiles:
        path = ws / lf
        if path.exists():
            try:
                content = path.read_bytes()
                hasher.update(content[:8192])  # First 8KB for speed
            except OSError:
                pass

    return hasher.hexdigest()[:16]


def build_env_image(
    workspace_path: str,
    project_id: str,
    repo_url: str,
    commit_sha: Optional[str] = None,
    force_rebuild: bool = False,
) -> dict[str, Any]:
    """
    Build and cache a Docker image for the repo environment.
    Returns image metadata including tag, build status, and commands.
    """
    ws = Path(workspace_path)
    stack_info = detect_stack(workspace_path)
    fingerprint = compute_env_fingerprint(workspace_path, stack_info)

    # Generate image tag
    repo_slug = repo_url.rstrip("/").split("/")[-1].lower().replace(".git", "")
    image_tag = f"neodevex-env/{repo_slug}:{fingerprint}"

    result: dict[str, Any] = {
        "image_tag": image_tag,
        "fingerprint": fingerprint,
        "stack": stack_info,
        "status": "pending",
        "built_at": None,
        "build_duration_ms": None,
        "dockerfile_content": None,
        "error": None,
    }

    # Check if image already exists (skip build)
    if not force_rebuild:
        check = subprocess.run(
            ["docker", "image", "inspect", image_tag],
            capture_output=True, text=True, timeout=10,
        )
        if check.returncode == 0:
            result["status"] = "cached"
            result["built_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return result

    # Use devcontainer if available
    if stack_info.get("has_devcontainer"):
        result["dockerfile_content"] = f"# Using devcontainer: {stack_info['devcontainer_path']}"
        # In production, use devcontainer CLI to build
        # For now, fall back to generated Dockerfile
        dockerfile_content = generate_dockerfile(stack_info, workspace_path)
    else:
        dockerfile_content = generate_dockerfile(stack_info, workspace_path)

    result["dockerfile_content"] = dockerfile_content

    # Write Dockerfile to a temp location (not in the repo)
    artifacts_dir = REPO_WORKSPACES_ROOT / project_id / ENV_ARTIFACTS_DIR
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    dockerfile_path = artifacts_dir / "Dockerfile"
    dockerfile_path.write_text(dockerfile_content, encoding="utf-8")

    # Build the image
    start = time.time()
    try:
        build_result = subprocess.run(
            [
                "docker", "build",
                "-t", image_tag,
                "-f", str(dockerfile_path),
                workspace_path,
            ],
            capture_output=True,
            text=True,
            timeout=600,  # 10 min timeout
            cwd=workspace_path,
        )

        duration_ms = int((time.time() - start) * 1000)
        result["build_duration_ms"] = duration_ms

        if build_result.returncode == 0:
            result["status"] = "built"
            result["built_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        else:
            result["status"] = "failed"
            result["error"] = (build_result.stderr or build_result.stdout)[-2000:]

    except subprocess.TimeoutExpired:
        result["status"] = "timeout"
        result["error"] = "Docker build timed out after 600s"
    except FileNotFoundError:
        result["status"] = "skipped"
        result["error"] = "Docker not available on this machine"

    return result


def save_env_artifacts(
    project_id: str,
    stack_info: dict[str, Any],
    image_result: dict[str, Any],
) -> dict[str, str]:
    """Persist env detection and build results as JSON artifacts."""
    artifacts_dir = REPO_WORKSPACES_ROOT / project_id / ENV_ARTIFACTS_DIR
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    # env.detect.json
    detect_path = artifacts_dir / "env.detect.json"
    detect_path.write_text(json.dumps(stack_info, indent=2), encoding="utf-8")

    # env.commands.json
    commands = {
        "install": stack_info.get("install_command", ""),
        "test": stack_info.get("test_commands", []),
        "lint": stack_info.get("lint_commands", []),
        "build": stack_info.get("build_commands", []),
    }
    commands_path = artifacts_dir / "env.commands.json"
    commands_path.write_text(json.dumps(commands, indent=2), encoding="utf-8")

    # env.image.json
    image_meta = {
        "image_tag": image_result.get("image_tag"),
        "fingerprint": image_result.get("fingerprint"),
        "status": image_result.get("status"),
        "built_at": image_result.get("built_at"),
        "build_duration_ms": image_result.get("build_duration_ms"),
        "error": image_result.get("error"),
    }
    image_path = artifacts_dir / "env.image.json"
    image_path.write_text(json.dumps(image_meta, indent=2), encoding="utf-8")

    return {
        "detect": str(detect_path),
        "commands": str(commands_path),
        "image": str(image_path),
    }


def load_env_artifacts(project_id: str) -> Optional[dict[str, Any]]:
    """Load previously saved env artifacts for a project."""
    artifacts_dir = REPO_WORKSPACES_ROOT / project_id / ENV_ARTIFACTS_DIR

    detect_path = artifacts_dir / "env.detect.json"
    commands_path = artifacts_dir / "env.commands.json"
    image_path = artifacts_dir / "env.image.json"

    if not detect_path.exists():
        return None

    try:
        return {
            "detect": json.loads(detect_path.read_text(encoding="utf-8")),
            "commands": json.loads(commands_path.read_text(encoding="utf-8")) if commands_path.exists() else {},
            "image": json.loads(image_path.read_text(encoding="utf-8")) if image_path.exists() else {},
        }
    except (json.JSONDecodeError, OSError):
        return None


def ensure_agent_ready_environment(
    repo_url: str,
    project_id: str,
    workspace_path: str,
    commit_sha: Optional[str] = None,
    force_rebuild: bool = False,
) -> dict[str, Any]:
    """
    Main entry point: detect stack + build/cache env image + save artifacts.
    Call this at the end of ingestion Phase 1.
    """
    # 1. Detect stack
    stack_info = detect_stack(workspace_path)

    # 2. Build/cache Docker image
    image_result = build_env_image(
        workspace_path=workspace_path,
        project_id=project_id,
        repo_url=repo_url,
        commit_sha=commit_sha,
        force_rebuild=force_rebuild,
    )

    # 3. Save artifacts
    artifact_paths = save_env_artifacts(project_id, stack_info, image_result)

    return {
        "stack": stack_info,
        "image": image_result,
        "artifact_paths": artifact_paths,
        "agent_ready": image_result["status"] in ("built", "cached"),
    }
