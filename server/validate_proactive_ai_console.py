#!/usr/bin/env python3
"""AI console log fallback + timeline metadata (pass 22/40)."""

from __future__ import annotations

import json
import os
import sys
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_ai_console import (  # noqa: E402
    append_ai_console_log,
    append_candidate_event,
    contains_invented_tool_action,
    generate_ai_console_log,
    sanitize_console_text,
    sort_candidate_timeline,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def _candidate() -> dict:
    return {
        "id": "cand-abc123456789",
        "title": "Improve validation",
        "hypothesis": "Add guard around session refresh.",
        "status": "preparing",
        "runId": "run-def987654321",
        "timeline": [],
    }


def _mock_response(payload: dict) -> object:
    class _Resp:
        def read(self):
            return json.dumps(payload).encode("utf-8")

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    return _Resp()


def main() -> int:
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ.pop("VITE_GEMINI_API_KEY", None)

    fallback = generate_ai_console_log(_candidate(), "preparing", "Workspace prepared", "Sandbox ready.")
    _assert(fallback.get("fallback"), "missing API key should use fallback")
    _assert(fallback.get("model") == "deterministic-fallback", "fallback model tag")
    _assert("Workspace prepared" in fallback.get("title", ""), "fallback title from source event")

    with patch.dict(
        os.environ,
        {"GEMINI_API_KEY": "test-key-not-printed", "PROACTIVE_AI_LOG_TIMEOUT_SECONDS": "2"},
        clear=False,
    ):
        with patch("proactive_ai_console.urllib.request.urlopen", side_effect=TimeoutError("slow")):
            timed = generate_ai_console_log(_candidate(), "patching", "Executor started", "Patch queued.")
    _assert(timed.get("fallback"), "timeout should fall back")
    _assert("test-key" not in json.dumps(timed), "must not leak api key in log payload")

    invented_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": json.dumps(
                                {
                                    "title": "Running npm test now",
                                    "detail": "I executed docker and opened files",
                                }
                            )
                        }
                    ]
                }
            }
        ]
    }
    with patch.dict(os.environ, {"GEMINI_API_KEY": "test-key-not-printed"}, clear=False):
        with patch(
            "proactive_ai_console.urllib.request.urlopen",
            return_value=_mock_response(invented_payload),
        ):
            blocked = generate_ai_console_log(_candidate(), "validating", "Collecting artifacts", "Diff ready.")
    _assert(blocked.get("fallback"), "invented tool wording should trigger fallback")
    _assert(not contains_invented_tool_action(blocked.get("detail", "")), "fallback detail must not invent tools")

    redacted = sanitize_console_text("token api_key=AIzaSySecretValue12345 bearer sk-abcdef123456")
    _assert("AIza" not in redacted, "sanitize should redact api key material")
    _assert("[redacted]" in redacted, "sanitize marks redaction")

    candidate = _candidate()
    from proactive_store import now_iso

    append_candidate_event(candidate, "preparing", "First event", "detail one", now_iso=now_iso)
    append_ai_console_log(candidate, "preparing", "First event", "detail one", now_iso=now_iso)
    append_candidate_event(candidate, "patching", "Second event", "detail two", now_iso=now_iso)

    sort_candidate_timeline(candidate)
    seqs = [int(item.get("seq", 0)) for item in candidate["timeline"]]
    _assert(seqs == sorted(seqs), "timeline must be deterministically ordered by seq")
    _assert(len(seqs) >= 3, "expected system + ai + system events")
    ai_events = [item for item in candidate["timeline"] if item.get("source") == "ai"]
    _assert(ai_events, "ai console log should append")
    meta = ai_events[0].get("aiLog") or {}
    _assert(meta.get("stage") == "preparing", "aiLog stage metadata")
    _assert(meta.get("sourceTitle"), "aiLog sourceTitle metadata")
    _assert("fallback" in meta, "aiLog fallback flag metadata")

    print("OK: proactive AI console logs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
