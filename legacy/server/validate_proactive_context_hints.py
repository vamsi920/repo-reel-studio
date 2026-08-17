#!/usr/bin/env python3
"""Context-hints normalization + selection influence (pass 30/40)."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))


def _install_import_stubs() -> None:
    import types

    if "fastapi" in sys.modules:
        return

    fastapi = types.ModuleType("fastapi")

    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

    fastapi.HTTPException = HTTPException
    fastapi.APIRouter = types.SimpleNamespace()
    sys.modules["fastapi"] = fastapi

    pydantic = types.ModuleType("pydantic")
    pydantic.BaseModel = type("BaseModel", (), {})
    pydantic.Field = lambda *args, **kwargs: None
    sys.modules["pydantic"] = pydantic


_install_import_stubs()

from proactive_context_hints import (  # noqa: E402
    compute_context_hint_bonus,
    context_hint_flags_for_path,
    merge_run_context_hints,
    normalize_proactive_context_hints,
    normalize_repo_relative_path,
)
from proactive_orchestrator import build_candidate, discover_candidates  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    abs_path = "/Users/dev/repo-reel-studio/src/lib/db.ts"
    _assert(normalize_repo_relative_path(abs_path) == "src/lib/db.ts", "absolute path should trim to repo-relative")
    _assert(normalize_repo_relative_path("local://src/foo.ts") == "src/foo.ts", "local:// prefix should normalize")
    _assert(normalize_repo_relative_path("../secret") is None, "path traversal should be rejected")

    raw = {
        "focusFiles": [abs_path, "src/lib/db.ts", "../x"],
        "hubFiles": ["/Users/dev/repo-reel-studio/server/proactive_api.py"],
        "entryFiles": ["src/main.tsx"],
        "technologies": ["TypeScript", "TypeScript", ""],
        "architecture": "  layered monolith ",
        "evidenceCount": "42",
        "snippetCount": 40,
    }
    normalized = normalize_proactive_context_hints(raw)
    _assert(normalized["focusFiles"] == ["src/lib/db.ts"], "focus files should dedupe after normalization")
    _assert(normalized["hubFiles"] == ["server/proactive_api.py"], "hub files should normalize")
    _assert(normalized["entryFiles"] == ["src/main.tsx"], "entry files should pass through")
    _assert(normalized["technologies"] == ["TypeScript"], "technologies should dedupe")
    _assert(normalized["architecture"] == "layered monolith", "architecture should trim")
    _assert(normalized["evidenceCount"] == 42, "evidenceCount should coerce")

    flags = context_hint_flags_for_path("src/lib/db.ts", normalized)
    _assert(flags["focus"], "focus path should match normalized hints")
    bonus = compute_context_hint_bonus(in_focus=flags["focus"], in_hub=flags["hub"], in_entry=flags["entry"])
    _assert(bonus >= 0.08, "focus match should earn hint bonus")

    merged = merge_run_context_hints("src/util.ts", normalized)
    _assert("src/util.ts" in merged["focusFiles"], "materialize merge should keep candidate path in focus")
    _assert("TypeScript" in merged["technologies"], "materialize merge should keep dispatch technologies")

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        src = root / "src"
        src.mkdir(parents=True)
        (src / "util.ts").write_text("// TODO: tighten timeout handling\n", encoding="utf-8")
        (root / "package.json").write_text('{"scripts":{"test":"vitest run"}}', encoding="utf-8")

        util_abs = str((src / "util.ts").resolve())
        hinted = discover_candidates(
            root,
            "https://github.com/example/context-hints.git",
            "proj",
            "batch",
            "example",
            {
                "focusFiles": [util_abs],
                "hubFiles": [],
                "entryFiles": [],
                "technologies": ["TS"],
                "evidenceCount": 40,
            },
            None,
        )
        util_candidates = [item for item in hinted if item["dedupeKey"].startswith("src/util.ts:")]
        _assert(util_candidates, "discovery should still find hinted file via absolute focus path")
        _assert(
            any(item["score"]["total"] >= 0.62 for item in util_candidates),
            "hinted util candidate should remain selectable",
        )

        plain = build_candidate(
            "https://github.com/example/context-hints.git",
            "example",
            "proj",
            "batch",
            "improvement",
            "Test",
            "Hypothesis",
            ["one"],
            "src/util.ts",
            centrality=4,
            has_test=False,
            hinted=True,
            context_hint_bonus=0.12,
            evidence_count=10,
        )
        baseline = build_candidate(
            "https://github.com/example/context-hints.git",
            "example",
            "proj",
            "batch2",
            "improvement",
            "Test",
            "Hypothesis",
            ["one"],
            "src/other.ts",
            centrality=4,
            has_test=False,
        )
        _assert(plain["score"]["total"] > baseline["score"]["total"], "hint bonus should lift score")

    print("OK: proactive context hints validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
