from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Optional

SCRIPT_KEY_GROUPS = {
    "test": ("test", "test:unit", "test:ci", "vitest", "jest"),
    "lint": ("lint", "lint:fix", "eslint"),
    "build": ("build", "build:prod", "compile"),
    "typecheck": ("typecheck", "check", "check:types"),
}

def _read_text_safe(path: Path, limit: int) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")[:limit]
    except OSError:
        return ""


PYTHON_MARKERS = (
    "pytest.ini",
    "pyproject.toml",
    "setup.cfg",
    "tox.ini",
    "noxfile.py",
)


def _command_values(raw: Any) -> list[str]:
    if isinstance(raw, list):
        return [str(item).strip() for item in raw if str(item).strip()]
    text = str(raw or "").strip()
    return [text] if text else []


def _bucket_available(commands: dict[str, Any], name: str) -> bool:
    return bool(_command_values(commands.get(name)))


def _merge_command_maps(*maps: dict[str, list[str]]) -> dict[str, list[str]]:
    merged: dict[str, list[str]] = {key: [] for key in SCRIPT_KEY_GROUPS}
    seen: dict[str, set[str]] = {key: set() for key in SCRIPT_KEY_GROUPS}
    for command_map in maps:
        for bucket, values in command_map.items():
            if bucket not in merged:
                continue
            for value in values:
                if value in seen[bucket]:
                    continue
                seen[bucket].add(value)
                merged[bucket].append(value)
    return {key: values for key, values in merged.items() if values}


def _overall_from_buckets(buckets: dict[str, list[str]], *, has_pytest_config: bool) -> str:
    has_test = bool(buckets.get("test"))
    has_lint = bool(buckets.get("lint"))
    has_build = bool(buckets.get("build") or buckets.get("typecheck"))
    if has_test and (has_lint or has_build):
        return "strong"
    if has_test or has_lint or has_build:
        return "moderate"
    if has_pytest_config:
        return "weak"
    return "none"


def detect_env_artifact_validation(env_artifacts: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not env_artifacts:
        return None
    commands = env_artifacts.get("commands")
    if not isinstance(commands, dict):
        return None

    buckets = {
        "test": _command_values(commands.get("test")),
        "lint": _command_values(commands.get("lint")),
        "build": _command_values(commands.get("build")),
        "typecheck": [],
    }
    install = _command_values(commands.get("install"))
    if install:
        buckets["install"] = install

    detect = env_artifacts.get("detect") if isinstance(env_artifacts.get("detect"), dict) else {}
    languages = list(detect.get("languages") or [])
    if not any(buckets.values()) and not install:
        return None

    command_buckets = {key: value for key, value in buckets.items() if key in SCRIPT_KEY_GROUPS and value}
    overall = _overall_from_buckets(command_buckets, has_pytest_config="python" in languages)
    return {
        "source": "env_artifacts",
        "overall": overall,
        "languages": languages,
        "commands": command_buckets,
        "install": install,
        "packageManager": detect.get("package_manager"),
    }


def detect_package_script_validation(workspace: Path) -> Optional[dict[str, Any]]:
    package_path = workspace / "package.json"
    if not package_path.exists():
        return None
    try:
        package = json.loads(package_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    scripts = package.get("scripts")
    if not isinstance(scripts, dict) or not scripts:
        return None

    buckets: dict[str, list[str]] = {key: [] for key in SCRIPT_KEY_GROUPS}
    for bucket, aliases in SCRIPT_KEY_GROUPS.items():
        for alias in aliases:
            command = scripts.get(alias)
            if isinstance(command, str) and command.strip():
                buckets[bucket].append(command.strip())

    if not any(buckets.values()):
        return None

    return {
        "source": "package_json",
        "overall": _overall_from_buckets(buckets, has_pytest_config=False),
        "languages": ["node"],
        "commands": {key: value for key, value in buckets.items() if value},
        "install": [],
        "packageManager": None,
    }


def detect_python_config_validation(workspace: Path) -> Optional[dict[str, Any]]:
    markers: list[str] = []
    has_pytest = False

    if (workspace / "pytest.ini").exists():
        markers.append("pytest.ini")
        has_pytest = True

    pyproject = workspace / "pyproject.toml"
    if pyproject.exists():
        markers.append("pyproject.toml")
        text = _read_text_safe(pyproject, 12000) or ""
        if re.search(r"\[tool\.pytest", text, re.I) or "[tool.pytest" in text:
            has_pytest = True

    setup_cfg = workspace / "setup.cfg"
    if setup_cfg.exists():
        markers.append("setup.cfg")
        text = _read_text_safe(setup_cfg, 8000) or ""
        if "pytest" in text.lower():
            has_pytest = True

    for name in ("tox.ini", "noxfile.py"):
        if (workspace / name).exists():
            markers.append(name)
            has_pytest = True

    if not markers:
        return None

    commands: dict[str, list[str]] = {}
    if has_pytest:
        commands["test"] = ["pytest"]
    overall = "moderate" if has_pytest else "weak"
    return {
        "source": "python_config",
        "overall": overall,
        "languages": ["python"],
        "commands": commands,
        "install": [],
        "packageManager": None,
        "markers": markers,
    }


def detect_validation_hints(
    workspace: Path,
    env_artifacts: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    workspace = workspace.resolve()
    env_profile = detect_env_artifact_validation(env_artifacts)
    package_profile = detect_package_script_validation(workspace)
    python_profile = detect_python_config_validation(workspace)

    profiles = [profile for profile in (env_profile, package_profile, python_profile) if profile]
    if not profiles:
        return {
            "source": "none",
            "overall": "none",
            "languages": [],
            "commands": {},
            "install": [],
            "packageManager": None,
            "markers": [],
            "sources": [],
        }

    merged_commands = _merge_command_maps(*(profile.get("commands") or {} for profile in profiles))
    languages: list[str] = []
    for profile in profiles:
        for language in profile.get("languages") or []:
            if language not in languages:
                languages.append(language)

    markers: list[str] = []
    for profile in profiles:
        markers.extend(profile.get("markers") or [])

    install: list[str] = []
    for profile in profiles:
        install.extend(profile.get("install") or [])
    install = list(dict.fromkeys(item for item in install if item))

    has_pytest_config = bool(markers) or bool(merged_commands.get("test"))
    overall = _overall_from_buckets(merged_commands, has_pytest_config=has_pytest_config)
    if env_profile and env_profile.get("overall") == "strong":
        overall = "strong"
    elif overall == "none" and python_profile:
        overall = python_profile.get("overall", "weak")

    primary = env_profile or package_profile or python_profile or {}
    return {
        "source": primary.get("source", "merged"),
        "overall": overall,
        "languages": languages,
        "commands": merged_commands,
        "install": install,
        "packageManager": (env_profile or {}).get("packageManager") or (package_profile or {}).get("packageManager"),
        "markers": markers,
        "sources": [profile.get("source") for profile in profiles if profile.get("source")],
    }


def validation_evidence_lines(profile: dict[str, Any]) -> list[str]:
    """Human-readable evidence lines for candidate payloads and UI."""
    if not profile or profile.get("overall") == "none":
        return ["No first-class validation command detected yet."]

    lines: list[str] = []
    sources = profile.get("sources") or ([profile.get("source")] if profile.get("source") else [])
    if sources:
        lines.append(f"Validation sources: {', '.join(sources)}.")

    commands = profile.get("commands") or {}
    available = [name for name in ("test", "lint", "build", "typecheck") if commands.get(name)]
    if available:
        lines.append(f"Validation commands available: {', '.join(available)}.")

    for bucket in ("test", "lint", "build", "typecheck"):
        values = commands.get(bucket) or []
        if values:
            preview = "; ".join(values[:2])
            lines.append(f"{bucket}: {preview}")

    markers = profile.get("markers") or []
    if markers:
        lines.append(f"Python validation config: {', '.join(markers[:4])}.")

    languages = profile.get("languages") or []
    if languages:
        lines.append(f"Detected stack languages: {', '.join(languages)}.")

    if profile.get("install"):
        lines.append("Install recipe available from agent env artifacts.")

    return lines[:6]


def detect_validation(workspace: Path, env_artifacts: Optional[dict[str, Any]] = None) -> list[str]:
    """Backward-compatible evidence line helper."""
    return validation_evidence_lines(detect_validation_hints(workspace, env_artifacts))
