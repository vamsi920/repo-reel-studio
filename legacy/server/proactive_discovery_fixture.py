"""
Deterministic tiny-repo fixture for proactive discovery dry-runs.

No GitHub clone, no OpenDevin — only list/scan/score/select on local files.
"""

from __future__ import annotations

import json
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

FIXTURE_REPO_URL = "https://github.com/example/proactive-discovery-fixture.git"
FIXTURE_PROJECT_ID = "discovery-fixture"
FIXTURE_BATCH_ID = "dryrun-batch-000000000001"
FIXTURE_REPO_NAME = "proactive-discovery-fixture"

# Stable file contents (keep byte-identical across runs).
_FIXTURE_FILES: dict[str, str] = {
    "package.json": json.dumps(
        {
            "name": FIXTURE_REPO_NAME,
            "private": True,
            "scripts": {
                "test": "vitest run --passWithNoTests",
                "lint": "eslint .",
                "build": "tsc -b",
            },
        },
        indent=2,
    )
    + "\n",
    "eslint.config.js": "export default [];\n",
    "src/util/helpers.ts": (
        "// TODO: add retry backoff for flaky upstream calls\n"
        "// FIXME: handle upstream 503 responses explicitly\n"
        "export function retry<T>(fn: () => T): T {\n"
        "  return fn();\n"
        "}\n"
    ),
    "src/core/index.ts": (
        "export function coreValue(): string {\n"
        "  return 'fixture-hub';\n"
        "}\n"
    ),
    "src/feature/alpha.ts": (
        "import { coreValue } from '../core/index';\n"
        "export const alpha = () => coreValue();\n"
    ),
    "src/feature/beta.ts": (
        "import { coreValue } from '../core/index';\n"
        "export const beta = () => coreValue();\n"
    ),
    "src/auth/session.ts": (
        "// TODO: rotate refresh tokens before morning deadline\n"
        "export const sessionStore = new Map<string, string>();\n"
    ),
    "config/secrets/vault.ts": (
        "// Fixture marker for sensitive-path risk scoring (no real secrets).\n"
        "export const VAULT_PLACEHOLDER = 'dry-run-only';\n"
    ),
}


@dataclass(frozen=True)
class DiscoveryDryRunResult:
    workspace: Path
    discovered: list[dict[str, Any]]
    selected: list[dict[str, Any]]
    validation_profile: dict[str, Any]


def write_discovery_fixture(root: Path) -> Path:
    """Materialize the tiny repo under ``root`` (created if missing)."""
    root.mkdir(parents=True, exist_ok=True)
    for rel_path, content in _FIXTURE_FILES.items():
        target = root / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
    return root


def materialize_discovery_fixture_workspace(base_dir: Optional[Path] = None) -> Path:
    if base_dir is not None:
        return write_discovery_fixture(base_dir)
    return write_discovery_fixture(Path(tempfile.mkdtemp(prefix="proactive-discovery-fixture-")))


def run_discovery_dry_run(
    workspace: Optional[Path] = None,
    *,
    target: int = 3,
    context_hints: Optional[dict[str, Any]] = None,
    tmp_root: Optional[Path] = None,
) -> DiscoveryDryRunResult:
    from proactive_candidate_dedupe import select_candidates
    from proactive_orchestrator import discover_candidates
    from proactive_validation_detect import detect_validation_hints

    ws = workspace or materialize_discovery_fixture_workspace(tmp_root)
    hints = context_hints or {
        "focusFiles": ["src/core/index.ts", "src/util/helpers.ts"],
        "hubFiles": ["src/core/index.ts"],
        "entryFiles": ["src/feature/alpha.ts"],
        "technologies": ["TypeScript"],
    }
    validation_profile = detect_validation_hints(ws, None)
    discovered = discover_candidates(
        ws,
        FIXTURE_REPO_URL,
        FIXTURE_PROJECT_ID,
        FIXTURE_BATCH_ID,
        FIXTURE_REPO_NAME,
        hints,
        None,
    )
    selected = select_candidates(discovered, target)
    return DiscoveryDryRunResult(
        workspace=ws,
        discovered=discovered,
        selected=selected,
        validation_profile=validation_profile,
    )


def _by_dedupe(candidates: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {str(item.get("dedupeKey") or ""): item for item in candidates}


def _paths(candidates: list[dict[str, Any]]) -> set[str]:
    keys: set[str] = set()
    for item in candidates:
        dedupe = str(item.get("dedupeKey") or "")
        if ":" in dedupe:
            keys.add(dedupe.split(":", 1)[0])
    return keys


def assert_discovery_fixture_expectations(result: DiscoveryDryRunResult) -> None:
    from proactive_candidate_score import SELECT_THRESHOLD
    from proactive_sandbox_policy import is_sensitive_path

    discovered = result.discovered
    selected = result.selected
    by_key = _by_dedupe(discovered)

    if not discovered:
        raise AssertionError("discovery dry-run produced no candidates")

    todo_util = by_key.get("src/util/helpers.ts:improvement")
    if not todo_util:
        raise AssertionError("expected TODO candidate for src/util/helpers.ts")
    if "TODO" not in str(todo_util.get("title") or "").upper():
        raise AssertionError("util candidate title should reference TODO")

    central = by_key.get("src/core/index.ts:improvement")
    if not central:
        raise AssertionError("expected centrality candidate for src/core/index.ts")
    if "validation coverage" not in str(central.get("title") or "").lower():
        raise AssertionError("central candidate should target missing test coverage")
    central_score = float(central.get("score", {}).get("centrality", 0) or 0)
    if central_score < 0.25:
        raise AssertionError("central file should have centrality score component >= 0.25")
    evidence_text = " ".join(str(x) for x in central.get("evidence") or [])
    if "imported by" not in evidence_text.lower():
        raise AssertionError("central candidate evidence should mention import count")

    auth_todo = by_key.get("src/auth/session.ts:improvement")
    if not auth_todo:
        raise AssertionError("expected TODO candidate on sensitive auth path")
    if auth_todo.get("score", {}).get("riskLabel") != "high":
        raise AssertionError("auth/session candidate should classify as high risk")

    if not is_sensitive_path("src/auth/session.ts"):
        raise AssertionError("fixture auth path should match sensitive-path policy")
    if not (result.workspace / "config/secrets/vault.ts").is_file():
        raise AssertionError("fixture should materialize config/secrets/vault.ts")

    profile = result.validation_profile
    if profile.get("overall") not in {"strong", "moderate"}:
        raise AssertionError(f"package scripts should yield usable validation profile, got {profile!r}")
    commands = profile.get("commands") or {}
    if not commands.get("test"):
        raise AssertionError("validation profile should detect package test script")

    missing_test_pkg = by_key.get("package.json:reliability")
    if missing_test_pkg and "test script" in str(missing_test_pkg.get("hypothesis") or "").lower():
        raise AssertionError("fixture package.json includes test script; should not emit missing-test candidate")

    eligible = [item for item in discovered if float(item.get("score", {}).get("total") or 0) >= SELECT_THRESHOLD]
    if len(eligible) < 2:
        raise AssertionError(
            f"expected at least two candidates >= {SELECT_THRESHOLD}, got {len(eligible)}: "
            f"{[(k, round(float(v['score']['total']), 3)) for k, v in by_key.items()]}"
        )

    if len(selected) < 2:
        raise AssertionError(
            f"select_candidates should pick at least two opportunities, got {len(selected)}"
        )

    selected_paths = _paths(selected)
    if "src/core/index.ts" not in selected_paths and "src/util/helpers.ts" not in selected_paths:
        raise AssertionError("selected set should include core hub or util TODO")

    scores = [round(float(item["score"]["total"]), 4) for item in discovered]
    if scores != sorted(scores, reverse=True):
        raise AssertionError("discovered list should be sorted by score desc")


def discovery_snapshot(result: DiscoveryDryRunResult) -> list[dict[str, Any]]:
    """Compact deterministic snapshot for repeatability checks."""
    rows: list[dict[str, Any]] = []
    for item in result.discovered:
        rows.append(
            {
                "dedupeKey": item.get("dedupeKey"),
                "type": item.get("type"),
                "title": item.get("title"),
                "total": round(float(item.get("score", {}).get("total") or 0), 4),
                "riskLabel": item.get("score", {}).get("riskLabel"),
                "status": item.get("status"),
            }
        )
    return rows


def main(argv: Optional[list[str]] = None) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Proactive discovery dry-run fixture")
    parser.add_argument("--target", type=int, default=3, help="select_candidates cap")
    parser.add_argument("--keep", type=str, default="", help="write fixture repo to this directory")
    args = parser.parse_args(argv)

    keep = Path(args.keep).expanduser() if args.keep else None
    result = run_discovery_dry_run(workspace=keep, target=max(1, min(int(args.target), 6)))
    assert_discovery_fixture_expectations(result)
    print(f"OK: discovery dry-run ({len(result.discovered)} discovered, {len(result.selected)} selected)")
    print(f"workspace: {result.workspace}")
    for item in result.selected:
        print(f"  selected {item.get('dedupeKey')} total={item.get('score', {}).get('total')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
