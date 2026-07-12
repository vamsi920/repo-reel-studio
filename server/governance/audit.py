"""
Tamper-evident audit log for governance decisions.

Append-only JSONL with a SHA-256 hash chain: each record embeds the hash of the
previous record, so any insertion, deletion, or edit breaks the chain and is
detectable via verify(). Stdlib only; thread-safe.
"""
from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Any, Optional

GENESIS_HASH = "0" * 64


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash(prev_hash: str, body: dict[str, Any]) -> str:
    return hashlib.sha256((prev_hash + _canonical(body)).encode("utf-8")).hexdigest()


class AuditLog:
    def __init__(self, path: Optional[str | os.PathLike[str]] = None):
        default = Path(__file__).resolve().parent.parent / ".governance" / "audit.jsonl"
        self.path = Path(os.getenv("GOVERNANCE_AUDIT_PATH", str(path or default)))
        self._lock = threading.Lock()
        self.path.parent.mkdir(parents=True, exist_ok=True)

    # -- writing ----------------------------------------------------------- #

    def _last(self) -> tuple[int, str]:
        """Return (last_seq, last_hash) by reading the final non-empty line."""
        if not self.path.exists():
            return (0, GENESIS_HASH)
        last_line = ""
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if line.strip():
                        last_line = line
        except OSError:
            return (0, GENESIS_HASH)
        if not last_line:
            return (0, GENESIS_HASH)
        try:
            record = json.loads(last_line)
            return (int(record.get("seq", 0)), str(record.get("hash", GENESIS_HASH)))
        except (ValueError, TypeError):
            return (0, GENESIS_HASH)

    def record(
        self,
        *,
        decision: str,
        action_type: str,
        subject: str,
        reason: str,
        rule: Optional[str] = None,
        policy: Optional[str] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Append one decision record and return it (including its chain hash)."""
        with self._lock:
            seq, prev_hash = self._last()
            body = {
                "seq": seq + 1,
                "ts": _now_iso(),
                "decision": decision,
                "action_type": action_type,
                "subject": subject[:500],
                "reason": reason[:1000],
                "rule": rule,
                "policy": policy,
                "context_digest": _digest(context or {}),
                "prev_hash": prev_hash,
            }
            body["hash"] = _hash(prev_hash, body)
            try:
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(_canonical(body) + "\n")
            except OSError:
                # Never let an audit-write failure block enforcement.
                pass
            return body

    # -- reading / verification ------------------------------------------- #

    def tail(self, limit: int = 100) -> list[dict[str, Any]]:
        if not self.path.exists():
            return []
        records: list[dict[str, Any]] = []
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if line.strip():
                        try:
                            records.append(json.loads(line))
                        except ValueError:
                            continue
        except OSError:
            return []
        return records[-limit:]

    def verify(self) -> dict[str, Any]:
        """Walk the chain; report whether it is intact and where it broke."""
        if not self.path.exists():
            return {"intact": True, "records": 0, "broken_at": None}
        prev_hash = GENESIS_HASH
        count = 0
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    if not line.strip():
                        continue
                    try:
                        record = json.loads(line)
                    except ValueError:
                        return {"intact": False, "records": count, "broken_at": count + 1, "error": "unparseable line"}
                    count += 1
                    stored_hash = record.get("hash")
                    body = {k: v for k, v in record.items() if k != "hash"}
                    if record.get("prev_hash") != prev_hash or _hash(prev_hash, body) != stored_hash:
                        return {"intact": False, "records": count, "broken_at": count}
                    prev_hash = stored_hash
        except OSError as exc:
            return {"intact": False, "records": count, "broken_at": None, "error": str(exc)}
        return {"intact": True, "records": count, "broken_at": None}


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _digest(context: dict[str, Any]) -> str:
    try:
        return hashlib.sha256(_canonical(context).encode("utf-8")).hexdigest()[:16]
    except (TypeError, ValueError):
        return "unhashable"
