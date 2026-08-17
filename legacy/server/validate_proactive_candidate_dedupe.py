#!/usr/bin/env python3
"""Candidate dedupe policy checks (pass 08/40)."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_candidate_dedupe import (  # noqa: E402
    BatchDedupeRegistry,
    RecentOpportunityIndex,
    opportunity_keys,
    register_candidate,
    select_candidates,
)


REPO = "https://github.com/example/proactive-dedupe.git"
PROJECT = "dedupe-test"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _candidate(
    path: str,
    kind: str,
    title: str,
    total: float,
    *,
    batch_id: str = "batch-1",
) -> dict:
    return {
        "id": f"{path}-{kind}-{total}",
        "batchId": batch_id,
        "repoUrl": REPO,
        "projectId": PROJECT,
        "status": "discovered",
        "type": kind,
        "title": title,
        "dedupeKey": f"{path}:{kind}",
        "score": {"total": total, "signal": total, "validation": total, "centrality": total, "risk": 0.8},
        "evidence": [],
    }


def main() -> int:
    keys = opportunity_keys("src/App.tsx", "improvement", "Resolve TODO in src/App.tsx")
    _assert(f"src/App.tsx:improvement" in keys, "primary dedupe key should be present")
    _assert(any(item.startswith("title:") for item in keys), "title key should be present")

    registry = BatchDedupeRegistry()
    strong = _candidate("src/a.ts", "bug", "Fix bug in a", 0.86)
    weak = _candidate("src/a.ts", "perf", "Lifecycle cleanup in a", 0.70)
    register_candidate(registry, strong)
    register_candidate(registry, weak)
    batch = registry.finalize()
    _assert(len(batch) == 2, "both candidates should remain visible in batch output")
    _assert(weak.get("status") == "not_selected", "weaker same-path candidate should be marked not_selected")
    _assert("Duplicate opportunity" in (weak.get("notSelectedReason") or ""), "duplicate reason should be explicit")

    prior = _candidate("src/auth.ts", "bug", "Auth hardening", 0.84, batch_id="prior-batch")
    recent = RecentOpportunityIndex(
        {
            f"path:src/auth.ts": {"candidate": prior, "batchId": "prior-batch"},
            f"src/auth.ts:bug": {"candidate": prior, "batchId": "prior-batch"},
        }
    )
    registry = BatchDedupeRegistry(recent)
    blocked = _candidate("src/auth.ts", "improvement", "Auth cleanup", 0.70)
    register_candidate(registry, blocked)
    _assert(
        "recent batch" in (blocked.get("notSelectedReason") or "").lower(),
        "cross-batch duplicate should cite recent batch",
    )

    pool = [
        _candidate("src/one.ts", "bug", "One", 0.90),
        _candidate("src/two.ts", "bug", "Two", 0.88),
        _candidate("src/one.ts", "perf", "One perf", 0.75),
    ]
    picked = select_candidates(pool, 2)
    _assert(len(picked) == 2, "selection should return two candidates")
    weak_same_path = next(item for item in pool if item["title"] == "One perf")
    _assert(
        "Duplicate" in (weak_same_path.get("notSelectedReason") or ""),
        "selection-time path duplicate should explain reason",
    )

    print("OK: proactive_candidate_dedupe validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
