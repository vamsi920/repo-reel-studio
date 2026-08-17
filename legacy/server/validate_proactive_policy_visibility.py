#!/usr/bin/env python3
"""Policy violation visibility + approval gating (pass 32/40)."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" in sys.modules:
        return
    fastapi = types.ModuleType("fastapi")
    fastapi.HTTPException = type("HTTPException", (Exception,), {})
    fastapi.APIRouter = lambda: types.SimpleNamespace(get=lambda *a, **k: (lambda fn: fn), post=lambda *a, **k: (lambda fn: fn))
    sys.modules["fastapi"] = fastapi
    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {})
    pydantic.Field = lambda *args, **kwargs: None
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_approval import resolve_proactive_approval  # noqa: E402
from proactive_policy_visibility import (  # noqa: E402
    POLICY_STATE_BLOCKED,
    POLICY_STATE_WARNING,
    assess_policy_visibility,
    attach_policy_visibility_to_candidate,
)
from proactive_sandbox_policy import sync_policy_metadata_to_candidate  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    blocked = assess_policy_visibility(
        violations=["Changed file secrets/token.txt matches proactive pathDenylist pattern '.env*'."],
        sensitive_paths=["src/auth/session.ts"],
    )
    _assert(blocked["policyStatus"] == POLICY_STATE_BLOCKED, "violations should block")
    _assert(blocked["prApprovalBlocked"], "blocked state should block approval")

    warning = assess_policy_visibility(
        violations=[],
        sensitive_paths=["src/auth/session.ts"],
    )
    _assert(warning["policyStatus"] == POLICY_STATE_WARNING, "sensitive-only should warn")
    _assert(not warning["prApprovalBlocked"], "warning should not hard-block")
    _assert(warning["prPromotionDiscouraged"], "warning should discourage PR")

    run = {
        "id": "run-policy",
        "status": "awaiting_review",
        "policyViolations": blocked["policyViolations"],
        "artifacts": {
            "patch": "diff",
            "diffStat": "1 file changed",
            "changedFiles": [{"path": "secrets/token.txt", "additions": 1, "deletions": 0, "sensitive": True}],
            "artifactPaths": {"patchDiff": "/tmp/p.diff"},
            "validation": {"overallStatus": "passed", "commands": [], "notes": []},
            "sandboxPolicy": {"sensitivePaths": ["secrets/token.txt"]},
            "qualityGates": {"gates": [], "recommendation": "review", "allPassed": False},
        },
    }
    candidate = {
        "id": "cand-policy",
        "status": "review_ready",
        "runId": run["id"],
        "reviewMetadata": {},
    }
    synced = sync_policy_metadata_to_candidate(candidate, run)
    _assert(synced["policyStatus"] == POLICY_STATE_BLOCKED, "candidate sync should block")
    _assert((synced.get("reviewMetadata") or {}).get("policyBlockReasons"), "review metadata should include reasons")

    enriched = attach_policy_visibility_to_candidate(synced, run)
    _assert(enriched["policyViolations"], "enriched candidate exposes violations")

    reject = resolve_proactive_approval(
        {"id": "c1", "status": "review_ready", "runId": run["id"], "reviewMetadata": synced["reviewMetadata"]},
        run,
    )
    _assert(reject.action == "reject", "blocked policy should reject approval")

    warn_run = {
        **run,
        "id": "run-warn",
        "policyViolations": [],
        "artifacts": {
            **run["artifacts"],
            "changedFiles": [{"path": "src/auth/session.ts", "additions": 1, "deletions": 0, "sensitive": True}],
            "sandboxPolicy": {"sensitivePaths": ["src/auth/session.ts"]},
        },
    }
    warn_candidate = sync_policy_metadata_to_candidate(
        {"id": "c2", "status": "review_ready", "runId": warn_run["id"], "reviewMetadata": {}},
        warn_run,
    )
    _assert(warn_candidate["policyStatus"] == POLICY_STATE_WARNING, "sensitive candidate warns")
    warn_outcome = resolve_proactive_approval(warn_candidate, warn_run)
    _assert(warn_outcome.action == "approved_internal", "warning should not promote PR")

    print("OK: proactive policy visibility validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
