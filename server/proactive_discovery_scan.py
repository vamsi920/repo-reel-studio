from __future__ import annotations

import os
import subprocess
import time
from pathlib import Path, PurePosixPath
from typing import Any, Optional

# Keep in sync with agent_runs.SOURCE_EXTENSIONS (discovery text scan only).
SCAN_SOURCE_EXTENSIONS = frozenset(
    {
        ".js",
        ".jsx",
        ".ts",
        ".tsx",
        ".mjs",
        ".cjs",
        ".py",
        ".go",
        ".rs",
        ".rb",
        ".php",
        ".java",
        ".json",
        ".css",
        ".scss",
        ".sass",
        ".less",
        ".md",
        ".mdx",
        ".sql",
        ".sh",
        ".yaml",
        ".yml",
        ".toml",
        ".vue",
        ".svelte",
    }
)

# Max bytes for discovery reads and scan inclusion (per file).
SCAN_MAX_FILE_BYTES = 80_000
# Cap listed paths so pathological repos cannot blow memory.
SCAN_MAX_LISTED_FILES = 8_000
# Sniff size for binary detection.
_BINARY_SNIFF_BYTES = 512

# Directory names excluded anywhere in the relative path (exact segment match).
SCAN_EXCLUDED_DIR_NAMES = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        ".proactive-mode",
        ".proactive-agent-ops",
        ".agent-runs",
        ".repo-workspaces",
        "node_modules",
        "vendor",
        "bower_components",
        "dist",
        "build",
        "out",
        "coverage",
        ".next",
        ".nuxt",
        ".output",
        ".svelte-kit",
        ".turbo",
        ".cache",
        ".parcel-cache",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        "__pycache__",
        ".venv",
        "venv",
        ".tox",
        "target",
        ".gradle",
        "Pods",
        "DerivedData",
        "storybook-static",
        ".vercel",
        ".netlify",
        ".idea",
        ".vscode",
    }
)

# Extensions treated as binary without reading content.
def _run_subprocess(command: list[str], cwd: str, timeout_seconds: int) -> dict[str, Any]:
    started = time.time()
    env = os.environ.copy()
    env["CI"] = "1"
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "exitCode": completed.returncode,
            "stdout": (completed.stdout or "")[-20000:],
            "stderr": (completed.stderr or "")[-20000:],
            "durationMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "exitCode": 124,
            "stdout": (exc.stdout or "")[-20000:] if isinstance(exc.stdout, str) else "",
            "stderr": ((exc.stderr or "")[-20000:] if isinstance(exc.stderr, str) else "")
            or f"Timed out after {timeout_seconds}s",
            "durationMs": int((time.time() - started) * 1000),
        }


BINARY_FILE_SUFFIXES = frozenset(
    {
        ".png",
        ".jpg",
        ".jpeg",
        ".gif",
        ".webp",
        ".ico",
        ".bmp",
        ".svg",
        ".pdf",
        ".zip",
        ".gz",
        ".tgz",
        ".bz2",
        ".xz",
        ".7z",
        ".rar",
        ".jar",
        ".war",
        ".wasm",
        ".so",
        ".dylib",
        ".dll",
        ".exe",
        ".bin",
        ".dat",
        ".class",
        ".woff",
        ".woff2",
        ".ttf",
        ".eot",
        ".otf",
        ".mp3",
        ".mp4",
        ".mov",
        ".avi",
        ".mkv",
        ".lockb",
    }
)


def normalize_relative_path(path: str) -> str:
    return str(PurePosixPath(path.replace("\\", "/")))


def path_has_excluded_segment(relative_path: str) -> bool:
    parts = PurePosixPath(normalize_relative_path(relative_path)).parts
    return any(part in SCAN_EXCLUDED_DIR_NAMES for part in parts)


def safe_file_size(absolute: Path) -> Optional[int]:
    try:
        return absolute.stat().st_size
    except OSError:
        return None


def is_binary_file(absolute: Path) -> bool:
    suffix = absolute.suffix.lower()
    if suffix in BINARY_FILE_SUFFIXES:
        return True
    try:
        with absolute.open("rb") as handle:
            sample = handle.read(_BINARY_SNIFF_BYTES)
    except OSError:
        return True
    if not sample:
        return False
    if b"\x00" in sample:
        return True
    text_like = sum(1 for byte in sample if byte in (9, 10, 13) or 32 <= byte < 127)
    return (text_like / len(sample)) < 0.80


def is_scannable_source_file(workspace: Path, relative_path: str) -> bool:
    relative = normalize_relative_path(relative_path)
    if path_has_excluded_segment(relative):
        return False
    absolute = workspace / relative
    if not _is_within_workspace(workspace, absolute):
        return False
    if absolute.is_symlink():
        return False
    if not absolute.is_file():
        return False
    if absolute.suffix.lower() not in SCAN_SOURCE_EXTENSIONS:
        return False
    size = safe_file_size(absolute)
    if size is None or size > SCAN_MAX_FILE_BYTES:
        return False
    if is_binary_file(absolute):
        return False
    return True


def _cap_file_list(paths: list[str]) -> list[str]:
    if len(paths) <= SCAN_MAX_LISTED_FILES:
        return paths
    return sorted(paths)[:SCAN_MAX_LISTED_FILES]


def _is_within_workspace(workspace: Path, absolute: Path) -> bool:
    try:
        absolute.resolve().relative_to(workspace.resolve())
        return True
    except ValueError:
        return False


def list_repo_files(workspace: Path) -> list[str]:
    """
    List repository-relative file paths for proactive discovery.

    Boundaries:
    - Uses `git ls-files` when `.git` exists (tracked files only).
    - Otherwise walks the workspace tree.
    - Drops paths with excluded directory segments (vendor/build/cache/etc.).
    - Does not follow symlinks to directories; skips non-files and broken links.
    - Caps total listed paths at SCAN_MAX_LISTED_FILES.
    - Does not filter by SOURCE_EXTENSIONS, size, or binary (see is_scannable_source_file).
    """
    workspace = workspace.resolve()
    if not workspace.is_dir():
        return []

    collected: list[str] = []
    if (workspace / ".git").is_dir():
        result = _run_subprocess(["git", "ls-files"], cwd=str(workspace), timeout_seconds=20)
        if result["exitCode"] == 0:
            for line in result["stdout"].splitlines():
                relative = line.strip()
                if not relative:
                    continue
                if path_has_excluded_segment(relative):
                    continue
                absolute = (workspace / relative)
                if not _is_within_workspace(workspace, absolute):
                    continue
                if absolute.is_file() and not absolute.is_symlink():
                    collected.append(normalize_relative_path(relative))
            return _cap_file_list(sorted(set(collected)))

    for dirpath, dirnames, filenames in os.walk(workspace, topdown=True, followlinks=False):
        current = Path(dirpath)
        dirnames[:] = [
            name
            for name in dirnames
            if not path_has_excluded_segment(
                normalize_relative_path(str((current / name).relative_to(workspace)))
            )
            and not (current / name).is_symlink()
        ]
        for name in filenames:
            absolute = current / name
            if absolute.is_symlink():
                continue
            if not absolute.is_file():
                continue
            if not _is_within_workspace(workspace, absolute):
                continue
            try:
                relative = normalize_relative_path(str(absolute.relative_to(workspace)))
            except ValueError:
                continue
            if path_has_excluded_segment(relative):
                continue
            collected.append(relative)

    return _cap_file_list(sorted(set(collected)))


def filter_scannable_source_files(workspace: Path, files: list[str]) -> list[str]:
    """Apply source-extension, size, and binary filters to listed repo paths."""
    return [path for path in files if is_scannable_source_file(workspace, path)]
