#!/usr/bin/env python3
"""Proactive sandbox policy enforcement (pass 20/40)."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any

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

from proactive_review_ready import assess_review_ready_package  # noqa: E402
from proactive_sandbox_policy import (  # noqa: E402
    annotate_changed_files,
    audit_changed_file_paths,
    audit_validation_commands,
    command_allowed,
    enforce_proactive_sandbox_policy,
    is_sensitive_path,
    path_matches_deny_pattern,
    sync_policy_metadata_to_candidate,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _run(policy: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": uuid.uuid4().hex,
        "status": "validating",
        "policy": policy,
        "policyViolations": [],
        "artifacts": {"validation": {"overallStatus": "passed", "commands": []}},
    }


def main() -> int:
    policy = {
        "commandAllowlist": ["npm test", "git diff --check"],
        "pathDenylist": [".git/**", ".env*", "node_modules/**"],
        "networkPolicy": "restricted",
        "forbiddenPaths": [".env"],
    }

    _assert(path_matches_deny_pattern("node_modules/pkg/index.js", "node_modules/**"), ".env deny node_modules")
    _assert(path_matches_deny_pattern(".env.local", ".env*"), ".env* pattern")
    _assert(is_sensitive_path("src/auth/session.ts"), "auth path sensitive")
    _assert(not is_sensitive_path("src/utils/format.ts"), "benign path not sensitive")

    forbidden = audit_changed_file_paths(
        [{"path": "node_modules/evil/index.js"}],
        policy,
    )
    _assert(forbidden, "node_modules change should violate pathDenylist")

    env_forbidden = audit_changed_file_paths([{"path": ".env.production"}], policy)
    _assert(env_forbidden, ".env change should violate policy")

    annotated = annotate_changed_files([{"path": "infra/terraform/main.tf", "additions": 1, "deletions": 0}])
    _assert(annotated[0].get("sensitive"), "infra path flagged sensitive")

    _assert(command_allowed("git diff --stat", policy["commandAllowlist"]), "readonly git allowed")
    _assert(not command_allowed("curl https://example.com", policy["commandAllowlist"]), "curl not allowed")

    network_blocked = audit_validation_commands(
        {
            "commands": [
                {"command": "npm test", "exitCode": 0},
                {"command": "curl https://registry.npmjs.org/pkg", "exitCode": 0},
            ]
        },
        policy,
    )
    _assert(any("networkPolicy" in item for item in network_blocked), "network command should violate")

    allowlist_blocked = audit_validation_commands(
        {"commands": [{"command": "make install", "exitCode": 0}]},
        policy,
    )
    _assert(any("allowlist" in item for item in allowlist_blocked), "non-allowlisted command should violate")

    workspace = Path(__file__).resolve().parent
    run, changed, violations = enforce_proactive_sandbox_policy(
        _run(policy),
        [{"path": "secrets/token.txt", "additions": 1, "deletions": 0}],
        {"commands": [{"command": "make install", "exitCode": 0}]},
        workspace,
    )
    _assert(violations, "enforce should aggregate violations")
    _assert(run.get("policyViolations"), "run.policyViolations populated")
    sandbox = (run.get("artifacts") or {}).get("sandboxPolicy") or {}
    _assert(sandbox.get("pathDenylist"), "sandboxPolicy includes pathDenylist")
    _assert((run.get("artifacts") or {}).get("policyAudit"), "policyAudit present on run")

    assessment = assess_review_ready_package(
        patch="diff",
        changed_files=changed,
        artifact_paths={"patchDiff": "/tmp/patch.diff"},
        validation=run["artifacts"]["validation"],
        quality_gates={"gates": []},
        policy_violations=violations,
    )
    _assert(not assessment["eligible"], "policy violations must block review_ready")
    _assert(assessment["policyBlocked"], "policyBlocked flag set")

    clean_run, clean_changed, clean_violations = enforce_proactive_sandbox_policy(
        _run(policy),
        [{"path": "src/feature.ts", "additions": 2, "deletions": 0}],
        {"commands": [{"command": "npm test", "exitCode": 0}]},
        workspace,
    )
    _assert(not clean_violations, "benign file + allowed command should be clean")
    _assert(clean_changed[0].get("path") == "src/feature.ts", "annotated path preserved")

    candidate = {"id": "cand-1", "reviewMetadata": {}}
    synced = sync_policy_metadata_to_candidate(candidate, clean_run)
    _assert((synced.get("reviewMetadata") or {}).get("sandboxPolicy"), "candidate metadata carries sandboxPolicy")

    print("OK: proactive sandbox policy")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
