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
    "java-maven": {
        "indicators": ["pom.xml"],
        "package_managers": {"pom.xml": "maven"},
        "test_commands": ["mvn -B test"],
        "lint_commands": [],
        "build_commands": [],
        "install_command_map": {"maven": "mvn -B -q -DskipTests package"},
    },
    "java-gradle": {
        "indicators": ["build.gradle", "build.gradle.kts"],
        "package_managers": {"build.gradle": "gradle", "build.gradle.kts": "gradle"},
        "test_commands": ["./gradlew test"],
        "lint_commands": [],
        "build_commands": [],
        "install_command_map": {"gradle": "./gradlew build -x test"},
    },
    "ruby": {
        "indicators": ["Gemfile"],
        "package_managers": {"Gemfile.lock": "bundler"},
        "test_commands": ["bundle exec rspec", "bundle exec rake test"],
        "lint_commands": [],
        "build_commands": [],
        "install_command_map": {"bundler": "bundle install"},
    },
    "php": {
        "indicators": ["composer.json"],
        "package_managers": {"composer.lock": "composer"},
        "test_commands": ["composer test", "vendor/bin/phpunit"],
        "lint_commands": [],
        "build_commands": [],
        "install_command_map": {"composer": "composer install --no-interaction"},
    },
    "dotnet": {
        "indicators": ["*.csproj", "*.sln", "*.fsproj"],
        "package_managers": {"packages.lock.json": "dotnet"},
        "test_commands": ["dotnet test"],
        "lint_commands": [],
        "build_commands": [],
        "install_command_map": {"dotnet": "dotnet restore && dotnet build -c Release"},
    },
}

BASE_IMAGES = {
    "node": "node:20-slim",
    "python": "python:3.12-slim",
    "go": "golang:1.22-bookworm",
    "rust": "rust:1.78-slim",
    "java-maven": "maven:3.9-eclipse-temurin-21",
    "java-gradle": "gradle:8-jdk21",
    "ruby": "ruby:3.3-slim",
    "php": "php:8.3-cli",
    "dotnet": "mcr.microsoft.com/dotnet/sdk:8.0",
}


def _indicator_exists(ws: Path, indicator: str) -> bool:
    """Check a stack indicator, which may be a glob pattern (e.g. "*.csproj")."""
    if "*" in indicator or "?" in indicator:
        return next(ws.glob(indicator), None) is not None
    return (ws / indicator).exists()


def _strip_jsonc_comments(text: str) -> str:
    """Strip // and /* */ comments from a JSONC document, respecting string literals."""
    out: list[str] = []
    i, n, in_string = 0, len(text), False
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if ch == "\\" and i + 1 < n:
                out.append(text[i + 1])
                i += 2
                continue
            if ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "/":
            while i < n and text[i] not in "\r\n":
                i += 1
            continue
        if ch == "/" and i + 1 < n and text[i + 1] == "*":
            i += 2
            while i + 1 < n and not (text[i] == "*" and text[i + 1] == "/"):
                i += 1
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def parse_devcontainer(workspace_path: str) -> Optional[dict[str, Any]]:
    """Parse .devcontainer/devcontainer.json if present.

    Only `image` and `postCreateCommand`/`onCreateCommand` are honored today.
    `build.dockerfile` and `features` are detected but not applied — surfaced
    via `warnings` so callers can say so instead of silently ignoring them.
    """
    ws = Path(workspace_path)
    for candidate in (ws / ".devcontainer" / "devcontainer.json", ws / ".devcontainer.json"):
        if not candidate.exists():
            continue
        try:
            data = json.loads(_strip_jsonc_comments(candidate.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            return None
        if not isinstance(data, dict):
            return None

        warnings: list[str] = []
        if isinstance(data.get("build"), dict) and data["build"].get("dockerfile"):
            warnings.append("devcontainer uses build.dockerfile — detected but not applied")
        if data.get("features"):
            warnings.append("devcontainer defines features — detected but not applied")

        install_cmd = data.get("postCreateCommand") or data.get("onCreateCommand")
        if isinstance(install_cmd, list):
            install_cmd = " && ".join(str(c) for c in install_cmd)

        return {
            "source": "devcontainer",
            "path": str(candidate.relative_to(ws)),
            "base_image": data.get("image"),
            "install_command": install_cmd,
            "warnings": warnings,
        }
    return None


def load_repo_env_config(workspace_path: str) -> Optional[dict[str, Any]]:
    """Read a company-committed build recipe from `.neodevex/env.json`, if present.

    Shape: {"install_command": str, "build_commands": [str], "test_commands": [str], "base_image": str}
    Lets a company adopt the product without waiting on auto-detection to
    support their stack — they just check in how to build/test themselves.
    """
    path = Path(workspace_path) / ".neodevex" / "env.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    return {"source": "repo_config", "path": ".neodevex/env.json", **data}


def detect_stack(workspace_path: str, overrides: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Detect languages, package manager, and baseline commands for a repo.

    Precedence, high to low: explicit `overrides` (project settings) >
    `.neodevex/env.json` checked into the repo > `.devcontainer/devcontainer.json`
    > STACK_DETECTORS auto-detection > bare unknown/ubuntu fallback.
    """
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
        "devcontainer_warnings": [],
        "base_image_override": None,
        "override_source": None,
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
        has_indicator = any(_indicator_exists(ws, ind) for ind in config["indicators"])
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

    # Layer: devcontainer.json (lowest-precedence override)
    devcontainer = parse_devcontainer(workspace_path)
    if devcontainer:
        detected["devcontainer_warnings"] = devcontainer.get("warnings", [])
        if devcontainer.get("base_image"):
            detected["base_image_override"] = devcontainer["base_image"]
            detected["override_source"] = "devcontainer"
        if devcontainer.get("install_command"):
            detected["install_command"] = devcontainer["install_command"]
            detected["override_source"] = "devcontainer"

    # Layer: repo-checked-in config (.neodevex/env.json)
    repo_config = load_repo_env_config(workspace_path)
    if repo_config:
        if repo_config.get("base_image"):
            detected["base_image_override"] = repo_config["base_image"]
        if repo_config.get("install_command"):
            detected["install_command"] = repo_config["install_command"]
        if repo_config.get("build_commands"):
            detected["build_commands"] = repo_config["build_commands"]
        if repo_config.get("test_commands"):
            detected["test_commands"] = repo_config["test_commands"]
        detected["override_source"] = "repo_config"

    # Layer: explicit project-level override (highest precedence)
    if overrides:
        if overrides.get("base_image"):
            detected["base_image_override"] = overrides["base_image"]
        if overrides.get("install_command"):
            detected["install_command"] = overrides["install_command"]
        if overrides.get("build_commands"):
            detected["build_commands"] = overrides["build_commands"]
        if overrides.get("test_commands"):
            detected["test_commands"] = overrides["test_commands"]
        detected["override_source"] = "project_override"

    return detected


def generate_dockerfile(stack_info: dict[str, Any], workspace_path: str) -> str:
    """Generate a Dockerfile for the detected stack."""
    lang = stack_info.get("primary_language", "unknown")
    base_image = stack_info.get("base_image_override") or BASE_IMAGES.get(lang, "ubuntu:22.04")
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
    ]

    if lang == "php":
        lines.append("RUN curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer")
        lines.append("")

    lines.append("# Copy dependency files first for layer caching")

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
    elif lang == "java-maven":
        lines.append("COPY pom.xml ./")
    elif lang == "java-gradle":
        lines.append("COPY build.gradle* settings.gradle* gradlew ./")
        if (ws / "gradle").exists():
            lines.append("COPY gradle ./gradle")
    elif lang == "ruby":
        lines.append("COPY Gemfile ./")
        if (ws / "Gemfile.lock").exists():
            lines.append("COPY Gemfile.lock ./")
    elif lang == "php":
        lines.append("COPY composer.json ./")
        if (ws / "composer.lock").exists():
            lines.append("COPY composer.lock ./")
    elif lang == "dotnet":
        lines.append("COPY *.csproj *.sln *.fsproj ./")

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
        "pom.xml", "build.gradle", "build.gradle.kts",
        "Gemfile.lock", "composer.lock", "packages.lock.json",
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
    project_overrides: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Build and cache a Docker image for the repo environment.
    Returns image metadata including tag, build status, and commands.
    """
    ws = Path(workspace_path)
    stack_info = detect_stack(workspace_path, overrides=project_overrides)
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

    # `stack_info` already carries the effective base image/install command —
    # detect_stack() applies devcontainer.json, .neodevex/env.json, and any
    # project-level override before we ever get here.
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
    project_overrides: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """
    Main entry point: detect stack + build/cache env image + save artifacts.
    Call this at the end of ingestion Phase 1.

    `project_overrides` (install_command/build_commands/test_commands/base_image)
    lets a per-project "Stack & Environment" setting take precedence over
    everything auto-detected, so a company can adopt this for a stack we
    don't recognize out of the box.
    """
    # 1. Detect stack
    stack_info = detect_stack(workspace_path, overrides=project_overrides)

    # 2. Build/cache Docker image
    image_result = build_env_image(
        workspace_path=workspace_path,
        project_id=project_id,
        repo_url=repo_url,
        commit_sha=commit_sha,
        force_rebuild=force_rebuild,
        project_overrides=project_overrides,
    )

    # 3. Save artifacts
    artifact_paths = save_env_artifacts(project_id, stack_info, image_result)

    return {
        "stack": stack_info,
        "image": image_result,
        "artifact_paths": artifact_paths,
        "agent_ready": image_result["status"] in ("built", "cached"),
    }
