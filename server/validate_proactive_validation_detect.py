#!/usr/bin/env python3
"""Validation detection checks (pass 09/40)."""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_validation_detect import (  # noqa: E402
    detect_validation_hints,
    validation_evidence_lines,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _write_js_repo(root: Path) -> None:
    (root / "package.json").write_text(
        json.dumps(
            {
                "scripts": {
                    "test": "vitest run",
                    "lint": "eslint .",
                    "build": "tsc -b",
                }
            }
        ),
        encoding="utf-8",
    )


def _write_python_repo(root: Path) -> None:
    (root / "pytest.ini").write_text("[pytest]\ntestpaths = tests\n", encoding="utf-8")
    (root / "pyproject.toml").write_text(
        "[tool.pytest.ini_options]\ntestpaths = [\"tests\"]\n",
        encoding="utf-8",
    )


def main() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        workspace = Path(tmp)

        empty = detect_validation_hints(workspace)
        _assert(empty["overall"] == "none", "empty repo should have no validation profile")
        empty_lines = validation_evidence_lines(empty)
        _assert(
            empty_lines == ["No first-class validation command detected yet."],
            "empty repo evidence line should stay stable for UI",
        )

        js_root = workspace / "js"
        js_root.mkdir()
        _write_js_repo(js_root)
        js_profile = detect_validation_hints(js_root)
        _assert(js_profile["overall"] in ("strong", "moderate"), "js repo should detect scripts")
        _assert("test" in js_profile["commands"], "js repo should expose test bucket")
        _assert("node" in js_profile["languages"], "js repo should tag node language")
        js_lines = validation_evidence_lines(js_profile)
        _assert(all(isinstance(line, str) for line in js_lines), "evidence lines must be strings")
        _assert(any("test" in line.lower() for line in js_lines), "js evidence should mention test")

        py_root = workspace / "py"
        py_root.mkdir()
        _write_python_repo(py_root)
        py_profile = detect_validation_hints(py_root)
        _assert(py_profile["overall"] in ("moderate", "weak"), "python repo should detect pytest config")
        _assert("python" in py_profile["languages"], "python repo should tag python language")
        py_lines = validation_evidence_lines(py_profile)
        _assert(any("pytest" in line.lower() or "python" in line.lower() for line in py_lines), "python evidence expected")

        env_artifacts = {
            "detect": {"languages": ["node"], "package_manager": "npm"},
            "commands": {
                "install": "npm ci",
                "test": ["npm test"],
                "lint": ["npm run lint --if-present"],
                "build": ["npm run build --if-present"],
            },
            "image": {"status": "cached", "image_tag": "repo-reel-studio-env:test"},
        }
        env_profile = detect_validation_hints(js_root, env_artifacts)
        _assert(env_profile["overall"] == "strong", "env artifacts with test+lint should be strong")
        _assert("env_artifacts" in env_profile.get("sources", []), "env artifacts should be listed as source")
        env_lines = validation_evidence_lines(env_profile)
        _assert(any("env" in line.lower() or "sources" in line.lower() for line in env_lines), "env source evidence expected")
        secret_like = " ".join(env_lines)
        _assert("npm ci" not in secret_like or "install recipe" in secret_like.lower(), "avoid dumping full install commands")

    print("OK: proactive validation detect")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
