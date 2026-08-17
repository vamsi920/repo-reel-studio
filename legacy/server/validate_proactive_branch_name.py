#!/usr/bin/env python3
"""Proactive branch naming stability checks (pass 21/40)."""

from __future__ import annotations

import re
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
    fastapi.APIRouter = type("APIRouter", (), {})
    sys.modules["fastapi"] = fastapi
    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {})
    pydantic.Field = lambda *args, **kwargs: None
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_branch_name import (  # noqa: E402
    sanitize_branch_name,
    build_branch_name_for_run,
    build_proactive_branch_name,
    build_proactive_branch_name_from_run,
    is_proactive_issue,
    resolve_approval_branch_name,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    candidate_id = "abc123def4567890"
    run_id = "run987zyxw6543210"
    punct_repo = "Acme.Corp/my_app.name"

    branch_a = build_proactive_branch_name(
        candidate_id=candidate_id,
        run_id=run_id,
        repo_name=punct_repo,
        title="Fix: auth/session edge-case!",
        candidate_type="improvement",
    )
    branch_b = build_proactive_branch_name(
        candidate_id=candidate_id,
        run_id=run_id,
        repo_name=punct_repo,
        title="Fix: auth/session edge-case!",
        candidate_type="improvement",
    )
    _assert(branch_a == branch_b, "repeat build should be stable")
    _assert(branch_a.startswith("neodevex/proactive-"), "proactive branch prefix")
    _assert(len(branch_a) <= 64, "branch must respect sanitize max length")
    _assert(re.fullmatch(r"[a-z0-9._/-]+", branch_a), "branch must avoid invalid characters")
    _assert("acme" in branch_a and "corp" in branch_a, "repo punctuation should slugify")

    other = build_proactive_branch_name(
        candidate_id=uuid.uuid4().hex,
        run_id=run_id,
        repo_name=punct_repo,
        title="Fix: auth/session edge-case!",
    )
    _assert(other != branch_a, "different candidates should not collide")

    issue = {
        "title": "Fix: auth/session edge-case!",
        "htmlUrl": f"proactive://candidate/{candidate_id}",
        "labels": ["proactive", "improvement"],
    }
    _assert(is_proactive_issue(issue), "proactive issue detect")
    run = {
        "id": run_id,
        "repoName": punct_repo,
        "issue": issue,
        "proactive": {"candidateId": candidate_id, "batchId": "batch-1"},
        "approval": {"branchName": branch_a},
    }
    _assert(build_branch_name_for_run(run) == branch_a, "run builder should match materialize branch")
    _assert(
        build_proactive_branch_name_from_run(run) == branch_a,
        "from_run builder should match",
    )

    manual = "feature/My-Custom_Branch"
    resolved = resolve_approval_branch_name(run, manual)
    _assert(resolved == sanitize_branch_name(manual), "manual branch override must win")
    _assert(
        resolve_approval_branch_name(run, None) == branch_a,
        "stored approval branch should be used when no manual override",
    )

    github_run = {
        "id": run_id,
        "repoName": "example/repo",
        "issue": {"number": 42, "title": "Real GitHub issue", "htmlUrl": "https://github.com/o/r/issues/42"},
        "approval": {},
    }
    github_branch = build_branch_name_for_run(github_run)
    _assert(github_branch.startswith("neodevex/issue-42-"), "github issues keep issue branch format")

    print("OK: proactive branch naming")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
