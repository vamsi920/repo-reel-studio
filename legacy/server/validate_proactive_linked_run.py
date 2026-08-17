#!/usr/bin/env python3
"""Linked-run validation artifact surfacing (pass 31/40)."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_linked_run import build_linked_run_summary, normalize_validation_block  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    validation = normalize_validation_block(
        {
            "overallStatus": "passed",
            "commands": [
                {
                    "command": "npm run lint",
                    "exitCode": 0,
                    "stdout": "ok",
                    "stderr": "",
                    "durationMs": 100,
                    "kind": "validation",
                }
            ],
            "notes": ["lint passed"],
        },
    )
    _assert(validation["overallStatus"] == "passed", "validation status should normalize")
    _assert(len(validation["commands"]) == 1, "validation commands should normalize")

    summary = build_linked_run_summary(
        {
            "id": "run-validate",
            "status": "awaiting_review",
            "artifacts": {
                "patch": "diff",
                "diffStat": "1 file changed",
                "changedFiles": [{"path": "src/a.ts", "additions": 1, "deletions": 0}],
                "validation": validation,
                "testMatrix": {
                    "suites": [
                        {
                            "suite": "lint",
                            "command": "npm run lint",
                            "status": "passed",
                            "durationMs": 100,
                            "exitCode": 0,
                            "impactedFiles": ["src/a.ts"],
                        }
                    ],
                    "overallStatus": "passed",
                    "totalDurationMs": 100,
                    "passRate": 1.0,
                },
                "qualityGates": {
                    "recommendation": "ship",
                    "allPassed": True,
                    "gates": [{"gate": "lint", "status": "passed", "detail": "npm run lint"}],
                },
                "changeIntent": {"hypothesis": "Fix lint", "evidenceSufficiency": "strong"},
            },
        },
    )
    _assert(summary is not None, "summary required")
    _assert(summary["hasPatch"], "hasPatch should be true")
    _assert(summary["testMatrix"]["suites"], "test matrix suites required")
    _assert(summary["qualityGates"]["gates"], "quality gates required")
    _assert(summary["validation"]["notes"] == ["lint passed"], "validation notes preserved")
    _assert(summary["changedFiles"][0]["path"] == "src/a.ts", "changed files preserved")

    empty = build_linked_run_summary(None)
    _assert(empty is None, "null run should not produce summary")

    print("OK: proactive linked run validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
