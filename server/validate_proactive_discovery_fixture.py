#!/usr/bin/env python3
"""Dry-run proactive discovery fixture — no GitHub/OpenDevin (pass 36/40)."""

from __future__ import annotations

import sys
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
    fastapi.APIRouter = lambda: types.SimpleNamespace(
        get=lambda *a, **k: (lambda fn: fn),
        post=lambda *a, **k: (lambda fn: fn),
    )
    sys.modules["fastapi"] = fastapi
    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {})
    pydantic.Field = lambda *a, **k: None
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_discovery_fixture import (  # noqa: E402
    assert_discovery_fixture_expectations,
    discovery_snapshot,
    run_discovery_dry_run,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def main() -> int:
    first = run_discovery_dry_run(target=3)
    try:
        assert_discovery_fixture_expectations(first)
    except AssertionError as exc:
        _fail(str(exc))

    second = run_discovery_dry_run(workspace=first.workspace, target=3)
    if discovery_snapshot(first) != discovery_snapshot(second):
        _fail("discovery snapshot differed on second run (non-deterministic)")

    selected_keys = [item.get("dedupeKey") for item in second.selected]
    if len(selected_keys) != len(set(selected_keys)):
        _fail("selected candidates contain duplicate dedupe keys")

    print(
        f"OK: proactive discovery fixture "
        f"({len(first.discovered)} discovered, {len(first.selected)} selected, deterministic)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
