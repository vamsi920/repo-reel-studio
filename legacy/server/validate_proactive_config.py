#!/usr/bin/env python3
"""Validation checks for proactive_config (pass 03/40)."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from proactive_config import (  # noqa: E402
    ProactiveConfigValidationError,
    clamp_target_count,
    coerce_morning_deadline,
    normalize_config_record,
    sanitize_timezone,
    validate_config_patch,
    validate_morning_deadline,
)
import proactive_store as store  # noqa: E402


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    _assert(clamp_target_count(10) == 6, "targetCount should clamp to 6")
    _assert(clamp_target_count(0) == 1, "targetCount should clamp to 1")

    try:
        clamp_target_count("bad")
        _fail("non-numeric targetCount should raise")
    except ProactiveConfigValidationError:
        pass

    _assert(validate_morning_deadline("9:30") == "09:30", "morningDeadline should normalize H:MM")
    _assert(validate_morning_deadline("23:59") == "23:59", "valid deadline should pass")

    try:
        validate_morning_deadline("24:00")
        _fail("invalid hour should raise")
    except ProactiveConfigValidationError as exc:
        _assert(exc.field == "morningDeadline", "error field should be morningDeadline")

    _assert(sanitize_timezone("  America/New_York  ") == "America/New_York", "timezone trim")
    _assert(sanitize_timezone("bad\x00zone") == "badzone", "timezone strips control chars")

    normalized = normalize_config_record(
        {
            "repoUrl": "https://github.com/example/a",
            "projectId": None,
            "enabled": "yes",
            "targetCount": "12",
            "morningDeadline": "7:15",
            "timezone": "US/Pacific",
            "updatedAt": "t",
        }
    )
    _assert(normalized["targetCount"] == 6, "read path should clamp legacy targetCount")
    _assert(normalized["morningDeadline"] == "07:15", "read path should coerce legacy deadline")

    tmp_root = Path(tempfile.mkdtemp(prefix="proactive-config-validate-"))
    os.environ["PROACTIVE_STORE_ROOT"] = str(tmp_root)
    repo = "https://github.com/example/proactive-config.git"
    try:
        store.update_config(repo, "p1", {"targetCount": 2, "morningDeadline": "08:45"})
        cfg = store.get_config(repo, "p1")
        _assert(cfg["targetCount"] == 2 and cfg["morningDeadline"] == "08:45", "valid patch should persist")

        try:
            store.update_config(repo, "p1", {"morningDeadline": "99:99"})
            _fail("invalid patch should raise before write")
        except ProactiveConfigValidationError:
            pass

        cfg_after = store.get_config(repo, "p1")
        _assert(cfg_after["morningDeadline"] == "08:45", "invalid patch must not corrupt stored config")
    finally:
        os.environ.pop("PROACTIVE_STORE_ROOT", None)
        shutil.rmtree(tmp_root, ignore_errors=True)

    try:
        validate_config_patch({"morningDeadline": "noon"})
        _fail("validate_config_patch should reject invalid deadline")
    except ProactiveConfigValidationError:
        pass

    print("OK: proactive_config validation passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
