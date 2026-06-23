#!/usr/bin/env python3
"""githubToken handling must not persist secrets (pass 34/40)."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from unittest import mock

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

from proactive_secret_sanitizer import (  # noqa: E402
    TEST_TOKEN_PLACEHOLDER,
    redact_secrets,
    scan_store_tree_for_secrets,
    strip_sensitive_fields,
    transient_github_token,
)
from proactive_store import create_batch, update_batch  # noqa: E402


TEST_TOKEN = TEST_TOKEN_PLACEHOLDER


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    _assert(redact_secrets(f"auth {TEST_TOKEN} done") == "auth *** done", "redact should mask token")
    stripped = strip_sensitive_fields(
        {
            "githubToken": TEST_TOKEN,
            "config": {"token": TEST_TOKEN, "enabled": True},
            "notes": [f"failed with {TEST_TOKEN}"],
        },
    )
    _assert("githubToken" not in stripped, "githubToken key stripped")
    _assert("token" not in stripped.get("config", {}), "nested token stripped")
    _assert(TEST_TOKEN not in str(stripped), "token value stripped from payload")

    prior = os.environ.get("GITHUB_TOKEN")
    os.environ["GITHUB_TOKEN"] = "ghp_prior_value_should_restore"
    with transient_github_token(TEST_TOKEN):
        _assert(os.environ.get("GITHUB_TOKEN") == TEST_TOKEN, "transient token applied")
    _assert(os.environ.get("GITHUB_TOKEN") == "ghp_prior_value_should_restore", "env restored")

    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-token-validate-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    try:
        batch = create_batch(
            "https://github.com/example/token-safety.git",
            "proj-token",
            4,
            "head",
            "example",
        )
        batch["githubToken"] = TEST_TOKEN
        batch["contextHints"] = {"notes": [TEST_TOKEN]}
        update_batch(batch)

        violations = scan_store_tree_for_secrets(tmp_root, needles=[TEST_TOKEN])
        _assert(not violations, f"store must not contain token: {violations}")

        captured_token: list[str | None] = []

        def _prep(repo_url: str, project_id: str | None, github_token: str | None = None):
            captured_token.append(github_token)
            return {
                "workspacePath": str(tmp_root / "ws"),
                "headCommit": "abc",
                "status": "synced",
                "detail": "scoped workspace ready",
            }

        with mock.patch("proactive_workspace.prepare_discovery_workspace", side_effect=_prep):
            from proactive_orchestrator import prepare_discovery_workspace

            info = prepare_discovery_workspace(
                "https://github.com/example/token-safety.git",
                "proj-token",
                TEST_TOKEN,
            )
        _assert(captured_token == [TEST_TOKEN], "token must reach workspace prep only")
        _assert(TEST_TOKEN not in str(info), "workspace info must not echo token")
        violations = scan_store_tree_for_secrets(tmp_root, needles=[TEST_TOKEN])
        _assert(not violations, f"workspace prep leaked token: {violations}")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)

    print("OK: proactive github token validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
