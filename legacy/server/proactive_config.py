from __future__ import annotations

import re
from typing import Any, Optional

TARGET_COUNT_MIN = 1
TARGET_COUNT_MAX = 6
TIMEZONE_MAX_LEN = 64
QUALITY_MODE_MAX_LEN = 32
MORNING_DEADLINE_RE = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")
MORNING_DEADLINE_LOOSE_RE = re.compile(r"^(\d{1,2}):([0-5]\d)$")
CONTROL_CHAR_RE = re.compile(r"[\x00-\x1f\x7f]")
CONFIG_PATCH_KEYS = frozenset({"enabled", "targetCount", "qualityMode", "timezone", "morningDeadline"})


class ProactiveConfigValidationError(ValueError):
    def __init__(self, field: str, message: str):
        self.field = field
        super().__init__(message)


def clamp_target_count(value: Any, *, field: str = "targetCount") -> int:
    if isinstance(value, bool):
        raise ProactiveConfigValidationError(field, f"{field} must be an integer between {TARGET_COUNT_MIN} and {TARGET_COUNT_MAX}")
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        raise ProactiveConfigValidationError(
            field,
            f"{field} must be an integer between {TARGET_COUNT_MIN} and {TARGET_COUNT_MAX}",
        ) from None
    return max(TARGET_COUNT_MIN, min(parsed, TARGET_COUNT_MAX))


def sanitize_timezone(value: Any, *, default: str = "local") -> str:
    text = CONTROL_CHAR_RE.sub("", str(value or "")).strip()
    if not text:
        return default
    if len(text) > TIMEZONE_MAX_LEN:
        text = text[:TIMEZONE_MAX_LEN]
    return text


def sanitize_quality_mode(value: Any, *, default: str = "high") -> str:
    text = CONTROL_CHAR_RE.sub("", str(value or "")).strip()
    if not text:
        return default
    return text[:QUALITY_MODE_MAX_LEN]


def coerce_morning_deadline(value: Any, *, default: str = "09:00") -> str:
    text = CONTROL_CHAR_RE.sub("", str(value or "")).strip()
    if MORNING_DEADLINE_RE.match(text):
        return text
    loose = MORNING_DEADLINE_LOOSE_RE.match(text)
    if loose:
        hour = int(loose.group(1))
        minute = loose.group(2)
        if 0 <= hour <= 23:
            return f"{hour:02d}:{minute}"
    return default


def validate_morning_deadline(value: Any, *, field: str = "morningDeadline") -> str:
    text = CONTROL_CHAR_RE.sub("", str(value or "")).strip()
    if MORNING_DEADLINE_RE.match(text):
        return text
    loose = MORNING_DEADLINE_LOOSE_RE.match(text)
    if loose:
        hour = int(loose.group(1))
        minute = loose.group(2)
        if 0 <= hour <= 23:
            return f"{hour:02d}:{minute}"
    raise ProactiveConfigValidationError(
        field,
        f"{field} must use 24-hour HH:MM format (example: 09:00)",
    )


def validate_config_patch(patch: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(patch, dict):
        raise ProactiveConfigValidationError("config", "Config patch must be an object")
    unknown = sorted(key for key in patch if key not in CONFIG_PATCH_KEYS)
    if unknown:
        raise ProactiveConfigValidationError(
            unknown[0],
            f"Unsupported config field(s): {', '.join(unknown)}",
        )

    normalized: dict[str, Any] = {}
    if "enabled" in patch and patch["enabled"] is not None:
        normalized["enabled"] = bool(patch["enabled"])

    if "targetCount" in patch and patch["targetCount"] is not None:
        normalized["targetCount"] = clamp_target_count(patch["targetCount"])

    if "qualityMode" in patch and patch["qualityMode"] is not None:
        normalized["qualityMode"] = sanitize_quality_mode(patch["qualityMode"])

    if "timezone" in patch and patch["timezone"] is not None:
        normalized["timezone"] = sanitize_timezone(patch["timezone"])

    if "morningDeadline" in patch and patch["morningDeadline"] is not None:
        normalized["morningDeadline"] = validate_morning_deadline(patch["morningDeadline"])

    return normalized


def validate_optional_target_count(value: Any, *, field: str = "targetCount") -> Optional[int]:
    if value is None:
        return None
    return clamp_target_count(value, field=field)


def normalize_config_record(config: dict[str, Any]) -> dict[str, Any]:
    """Lenient normalization for persisted + merged config (read path)."""
    normalized = dict(config)
    normalized["enabled"] = bool(normalized.get("enabled"))
    try:
        normalized["targetCount"] = clamp_target_count(normalized.get("targetCount", TARGET_COUNT_MAX))
    except ProactiveConfigValidationError:
        normalized["targetCount"] = TARGET_COUNT_MAX
    normalized["qualityMode"] = sanitize_quality_mode(normalized.get("qualityMode"))
    normalized["timezone"] = sanitize_timezone(normalized.get("timezone"))
    normalized["morningDeadline"] = coerce_morning_deadline(normalized.get("morningDeadline"))
    normalized["updatedAt"] = str(normalized.get("updatedAt") or "")
    return normalized
