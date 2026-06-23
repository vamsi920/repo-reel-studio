#!/usr/bin/env python3
"""
Final proactive backend stability gate (pass 38/40).

Runs, in order:
  1. Python bytecode compile for proactive modules + validators + tests
  2. Focused validate_proactive_*.py smoke scripts
  3. unittest discover for test_proactive_*.py

No servers, GitHub, OpenDevin, or repo-wide ESLint.
"""

from __future__ import annotations

import argparse
import py_compile
import subprocess
import sys
import unittest
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent

# Curated validators (fast, no live network). Sorted for stable logs.
VALIDATOR_SCRIPTS: tuple[str, ...] = (
    "validate_proactive_ai_console.py",
    "validate_proactive_api.py",
    "validate_proactive_approval.py",
    "validate_proactive_branch_name.py",
    "validate_proactive_candidate_dedupe.py",
    "validate_proactive_candidate_score.py",
    "validate_proactive_config.py",
    "validate_proactive_context_hints.py",
    "validate_proactive_discovery_fixture.py",
    "validate_proactive_discovery_scan.py",
    "validate_proactive_dispatch.py",
    "validate_proactive_dispatch_skipped.py",
    "validate_proactive_dismiss.py",
    "validate_proactive_execution_control.py",
    "validate_proactive_failure_recovery.py",
    "validate_proactive_github_token.py",
    "validate_proactive_linked_run.py",
    "validate_proactive_local_repo.py",
    "validate_proactive_materialize.py",
    "validate_proactive_no_patch_failure.py",
    "validate_proactive_opendevin_fallback.py",
    "validate_proactive_policy_visibility.py",
    "validate_proactive_review_ready.py",
    "validate_proactive_retention.py",
    "validate_proactive_sandbox_policy.py",
    "validate_proactive_status_summary.py",
    "validate_proactive_store.py",
    "validate_proactive_synthetic_issue.py",
    "validate_proactive_validation_detect.py",
    "validate_proactive_workspace.py",
)


def _compile_paths(paths: list[Path]) -> list[str]:
    failures: list[str] = []
    for path in paths:
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError as exc:
            failures.append(f"{path.relative_to(REPO_ROOT)}: {exc.msg}")
    return failures


def collect_compile_targets() -> list[Path]:
    targets: list[Path] = []
    for pattern in (
        "proactive_*.py",
        "validate_proactive_*.py",
        "verify_proactive_stability.py",
        "proactive_dispatch_cron.py",
    ):
        targets.extend(sorted(SERVER_DIR.glob(pattern)))
    tests_dir = SERVER_DIR / "tests"
    if tests_dir.is_dir():
        targets.extend(sorted(tests_dir.glob("test_proactive_*.py")))
        harness = tests_dir / "proactive_test_harness.py"
        if harness.is_file():
            targets.append(harness)
    deduped: list[Path] = []
    seen: set[Path] = set()
    for path in targets:
        resolved = path.resolve()
        if resolved in seen or not path.is_file():
            continue
        seen.add(resolved)
        deduped.append(path)
    return deduped


def run_compile_step() -> int:
    print("==> compile proactive Python modules")
    targets = collect_compile_targets()
    failures = _compile_paths(targets)
    if failures:
        print("FAIL: proactive Python compile", file=sys.stderr)
        for item in failures:
            print(f"  {item}", file=sys.stderr)
        return 1
    print(f"OK: proactive Python compile ({len(targets)} files)")
    return 0


def run_validators(*, include_api_routes: bool) -> int:
    print("==> validate_proactive smoke scripts")
    scripts = list(VALIDATOR_SCRIPTS)
    if include_api_routes:
        scripts.append("validate_proactive_api_routes.py")

    exit_code = 0
    for name in scripts:
        path = SERVER_DIR / name
        if not path.is_file():
            print(f"FAIL: missing validator {name}", file=sys.stderr)
            exit_code = 1
            continue
        result = subprocess.run(
            [sys.executable, str(path)],
            cwd=str(SERVER_DIR),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            exit_code = 1
            print(f"FAIL: {name}", file=sys.stderr)
            if result.stdout.strip():
                print(result.stdout.strip(), file=sys.stderr)
            if result.stderr.strip():
                print(result.stderr.strip(), file=sys.stderr)
        else:
            line = result.stdout.strip().splitlines()[-1] if result.stdout.strip() else "OK"
            print(f"OK: {name} ({line})")
    return exit_code


def run_unittest_step(*, verbosity: int) -> int:
    print("==> unittest discover test_proactive_*.py")
    if str(SERVER_DIR) not in sys.path:
        sys.path.insert(0, str(SERVER_DIR))
    suite = unittest.defaultTestLoader.discover(
        str(SERVER_DIR / "tests"),
        pattern="test_proactive_*.py",
        top_level_dir=str(SERVER_DIR),
    )
    result = unittest.TextTestRunner(verbosity=verbosity).run(suite)
    if result.wasSuccessful():
        print(f"OK: proactive unittest suite ({result.testsRun} tests)")
        return 0
    print(
        f"FAIL: proactive unittest suite "
        f"(failures={len(result.failures)}, errors={len(result.errors)})",
        file=sys.stderr,
    )
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Proactive backend stability verification")
    parser.add_argument(
        "--skip-validators",
        action="store_true",
        help="Only compile + unittest (faster local loop)",
    )
    parser.add_argument(
        "--skip-unittest",
        action="store_true",
        help="Only compile + validators",
    )
    parser.add_argument(
        "--with-api-routes",
        action="store_true",
        help="Also run validate_proactive_api_routes.py (needs fastapi)",
    )
    parser.add_argument("-v", "--verbose", action="store_true", help="Verbose unittest output")
    args = parser.parse_args(argv)

    steps: list[tuple[str, int]] = []

    code = run_compile_step()
    steps.append(("compile", code))
    if code != 0:
        return code

    if not args.skip_validators:
        code = run_validators(include_api_routes=args.with_api_routes)
        steps.append(("validators", code))
        if code != 0:
            return code

    if not args.skip_unittest:
        code = run_unittest_step(verbosity=2 if args.verbose else 1)
        steps.append(("unittest", code))
        if code != 0:
            return code

    print("OK: proactive backend stability verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
