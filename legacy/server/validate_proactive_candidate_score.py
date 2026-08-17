#!/usr/bin/env python3
"""Candidate scoring checks (pass 07/40)."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_candidate_dedupe import select_candidates  # noqa: E402
from proactive_candidate_score import (  # noqa: E402
    MAX_SELECT_TARGET,
    SELECT_THRESHOLD,
    compute_candidate_score,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _candidate(total: float, path: str, *, dedupe: str | None = None) -> dict:
    return {
        "id": f"id-{path}-{total}",
        "dedupeKey": dedupe or f"{path}:improvement",
        "evidence": [f"Ranking: total={total:.3f}"],
        "score": {
            "total": total,
            "signal": 0.5,
            "validation": 0.5,
            "centrality": 0.5,
            "risk": 0.5,
            "riskLabel": "low",
        },
    }


def main() -> int:
    structured = compute_candidate_score(
        path="src/utils/format.ts",
        evidence_count=3,
        centrality=4,
        has_nearby_test=True,
        context_hinted=True,
        validation_profile={
            "overall": "strong",
            "commands": {"test": ["npm test"], "lint": ["npm run lint"], "build": ["npm run build"]},
        },
    )
    _assert(structured["total"] >= 0.78, "structured validation profile should score strongly")

    high = compute_candidate_score(
        path="src/utils/format.ts",
        evidence_count=3,
        centrality=4,
        has_nearby_test=True,
        context_hinted=True,
        validation_hints=["Validation commands available: test, lint, build"],
    )
    _assert(high["total"] >= 0.78, "high-quality candidate should score >= 0.78")
    _assert(high["riskLabel"] == "low", "utility path should be low risk")
    _assert("Ranking:" in high["summary"], "score summary should be explainable")

    medium = compute_candidate_score(
        path="src/components/Panel.tsx",
        evidence_count=2,
        centrality=3,
        has_nearby_test=False,
        context_hinted=False,
        validation_hints=["Python validation config detected."],
    )
    _assert(SELECT_THRESHOLD <= medium["total"] < 0.82, "medium candidate should sit near threshold band")
    _assert(medium["riskLabel"] == "low", "panel path should be low risk")

    rejected = compute_candidate_score(
        path="src/auth/payment/session.ts",
        evidence_count=1,
        centrality=1,
        has_nearby_test=False,
        context_hinted=False,
        validation_hints=[],
    )
    _assert(rejected["total"] < SELECT_THRESHOLD, "high-risk low-signal candidate should be rejected")
    _assert(rejected["riskLabel"] == "high", "auth/payment path should be high risk")

    selected = select_candidates(
        [_candidate(0.40, "src/auth/x.ts"), _candidate(0.86, "src/lib/ok.ts")],
        1,
    )
    _assert(len(selected) == 1, "select should return one candidate")
    _assert(selected[0]["score"]["total"] == 0.86, "highest scoring candidate should be selected")
    _assert(selected[0].get("selectedReason"), "selected candidate should include selectedReason")

    pool = [_candidate(0.86, "src/a.ts"), _candidate(0.70, "src/a.ts", dedupe="src/a.ts:perf")]
    blocked = select_candidates(pool, 2)
    _assert(len(blocked) == 1, "dedupe should keep one path winner unless second is very strong")
    _assert(
        any("Duplicate" in (item.get("notSelectedReason") or "") for item in pool if item not in blocked),
        "path duplicate should include Duplicate notSelectedReason",
    )

    capped = select_candidates([_candidate(0.9, f"src/{i}.ts") for i in range(10)], 99)
    _assert(len(capped) == MAX_SELECT_TARGET, f"selection must cap at {MAX_SELECT_TARGET}")

    print("OK: proactive_candidate_score validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
