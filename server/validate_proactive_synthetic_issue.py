#!/usr/bin/env python3
"""Synthetic proactive issue snapshots (pass 29/40)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" not in sys.modules:
        fastapi = types.ModuleType("fastapi")

        class HTTPException(Exception):
            def __init__(self, status_code: int = 500, detail: str = ""):
                super().__init__(detail)
                self.status_code = status_code
                self.detail = detail

        fastapi.HTTPException = HTTPException
        fastapi.APIRouter = types.SimpleNamespace()
        sys.modules["fastapi"] = fastapi

    if "pydantic" not in sys.modules:
        pydantic = types.ModuleType("pydantic")
        pydantic.BaseModel = type("BaseModel", (), {})
        pydantic.Field = lambda *args, **kwargs: None
        sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_branch_name import PROACTIVE_ISSUE_PREFIX  # noqa: E402
from proactive_synthetic_issue import (  # noqa: E402
    attach_synthetic_issue_to_run,
    build_synthetic_issue,
    build_synthetic_issue_body,
    proactive_issue_url,
)
from proactive_materialize import build_proactive_run_record  # noqa: E402

REPO = "https://github.com/example/proactive-synthetic.git"
FIXED_ID = "cand00000000000000000000000001"


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _fixture(kind: str) -> dict:
    base = {
        "id": FIXED_ID,
        "batchId": "batch-1",
        "repoUrl": REPO,
        "repoName": "example",
        "projectId": "synthetic-test",
        "status": "selected",
        "type": kind,
        "title": f"Placeholder {kind} title",
        "hypothesis": f"Candidate hypothesis for {kind}.",
        "dedupeKey": f"src/{kind}/handler.ts:{kind}",
        "evidence": [
            f"Signal detected in src/{kind}/handler.ts.",
            "Ranking: total=0.820",
            "Validation commands available: test, lint",
        ],
        "score": {
            "signal": 0.8,
            "validation": 0.7,
            "centrality": 0.6,
            "risk": 0.88,
            "riskLabel": "low" if kind != "reliability" else "medium",
            "total": 0.82,
        },
        "validationProfile": {
            "overall": "strong",
            "commands": {
                "test": ["npm test"],
                "lint": ["npm run lint"],
            },
        },
    }
    if kind == "bug":
        base["hypothesis"] = "src/auth/session.ts contains a FIXME for expired session handling."
        base["dedupeKey"] = "src/auth/session.ts:bug"
    elif kind == "perf":
        base["hypothesis"] = "src/ui/dashboard.tsx uses setInterval without cleanup."
        base["dedupeKey"] = "src/ui/dashboard.tsx:perf"
    elif kind == "reliability":
        base["hypothesis"] = "src/api/client.ts awaits fetch without abort or timeout guard."
        base["dedupeKey"] = "src/api/client.ts:reliability"
        base["score"]["riskLabel"] = "medium"
    return base


EXPECTED_SECTIONS = {
    "bug": [
        "## Summary",
        "## Evidence",
        "## Validation focus",
        "## Blast radius",
        "## Constraints",
        "root cause",
        "npm test",
        "Risk level: **low**",
    ],
    "perf": [
        "perf",
        "setInterval",
        "Avoid API or UX behavior changes",
        "npm test",
    ],
    "reliability": [
        "reliability",
        "failure, cancellation, or stale state",
        "Risk level: **medium**",
    ],
    "improvement": [
        "improvement",
        "public interfaces stable",
        "Focus path:",
    ],
}


def _snapshot_issue(kind: str) -> dict:
    issue = build_synthetic_issue(_fixture(kind))
    return {
        "title": issue["title"],
        "labels": issue["labels"],
        "htmlUrl": issue["htmlUrl"],
        "body": issue["body"],
        "commentCount": len(issue.get("comments") or []),
    }


def main() -> int:
    for kind in ("bug", "perf", "reliability", "improvement"):
        issue = build_synthetic_issue(_fixture(kind))
        _assert(issue["htmlUrl"] == proactive_issue_url(FIXED_ID), f"{kind} proactive url")
        _assert(issue["htmlUrl"].startswith(PROACTIVE_ISSUE_PREFIX), f"{kind} url prefix")
        _assert(len(issue["body"]) <= 2800, f"{kind} body within cap")
        _assert(len(issue["body"]) >= 200, f"{kind} body not empty")
        for snippet in EXPECTED_SECTIONS[kind]:
            _assert(snippet in issue["body"], f"{kind} missing snippet: {snippet}")
        _assert(kind in issue["labels"], f"{kind} label present")
        _assert(len(issue.get("comments") or []) <= 3, f"{kind} comment cap")

    body = build_synthetic_issue_body(_fixture("bug"))
    _assert("Ranking:" not in body, "ranking noise stripped from body")

    snapshots = {kind: _snapshot_issue(kind) for kind in ("bug", "perf", "reliability", "improvement")}
    encoded = json.dumps(snapshots, indent=2, sort_keys=True)
    if len(encoded) < 100:
        _fail("snapshot payload too small")

    run = build_proactive_run_record(_fixture("bug"), "run-synthetic-1")
    run = attach_synthetic_issue_to_run(run, _fixture("bug"))
    _assert(run.get("issue"), "materialize attaches synthetic issue")
    _assert(run["issue"]["htmlUrl"].startswith(PROACTIVE_ISSUE_PREFIX), "run issue url proactive")

    print("OK: proactive synthetic issue snapshots")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
