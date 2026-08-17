"""Background proactive dispatch scheduler — keeps enabled scopes running without external cron."""

from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Optional

_log = logging.getLogger("proactive.scheduler")
_SCHEDULER_THREAD: Optional[threading.Thread] = None
_STOP_EVENT = threading.Event()


def scheduler_interval_seconds() -> int:
    raw = os.getenv("PROACTIVE_SCHEDULER_INTERVAL_SECONDS", "120").strip()
    try:
        return max(30, min(int(raw), 3600))
    except (TypeError, ValueError):
        return 120


def scheduler_enabled() -> bool:
    raw = os.getenv("PROACTIVE_SCHEDULER_ENABLED", "true").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def run_scheduler_tick() -> list[dict[str, Any]]:
    from proactive_orchestrator import dispatch_daily
    from proactive_store import list_proactive_dispatch_scopes

    results: list[dict[str, Any]] = []
    for scope in list_proactive_dispatch_scopes(enabled_only=True):
        repo_url = str(scope.get("repoUrl") or "").strip()
        project_id = scope.get("projectId")
        if not repo_url:
            continue
        try:
            result = dispatch_daily(
                repo_url,
                project_id=project_id if project_id else None,
            )
            status = str(result.get("status") or "unknown")
            _log.info(
                "proactive scheduler: %s::%s -> %s",
                repo_url,
                project_id or "",
                status,
            )
            results.append({"scope": scope, "status": status, "result": result})
        except Exception as exc:
            _log.exception(
                "proactive scheduler failed for %s::%s",
                repo_url,
                project_id or "",
            )
            results.append({"scope": scope, "status": "error", "error": str(exc)})
    return results


def _scheduler_loop() -> None:
    if _STOP_EVENT.wait(5):
        return
    while not _STOP_EVENT.is_set():
        if scheduler_enabled():
            try:
                run_scheduler_tick()
            except Exception:
                _log.exception("proactive scheduler tick failed")
        if _STOP_EVENT.wait(scheduler_interval_seconds()):
            break


def start_proactive_scheduler() -> None:
    global _SCHEDULER_THREAD
    if not scheduler_enabled():
        _log.info("proactive scheduler disabled (PROACTIVE_SCHEDULER_ENABLED=false)")
        return
    if _SCHEDULER_THREAD and _SCHEDULER_THREAD.is_alive():
        return
    _STOP_EVENT.clear()
    _SCHEDULER_THREAD = threading.Thread(
        target=_scheduler_loop,
        name="proactive-scheduler",
        daemon=True,
    )
    _SCHEDULER_THREAD.start()
    _log.info("proactive scheduler started (interval=%ss)", scheduler_interval_seconds())


def stop_proactive_scheduler() -> None:
    _STOP_EVENT.set()
    thread = _SCHEDULER_THREAD
    if thread and thread.is_alive():
        thread.join(timeout=2)


def schedule_proactive_dispatch(
    repo_url: str,
    *,
    project_id: Optional[str] = None,
    repo_name: Optional[str] = None,
) -> None:
    """Fire-and-forget dispatch for a single scope (e.g. right after enabling proactive)."""

    def _run() -> None:
        try:
            from proactive_orchestrator import dispatch_daily

            result = dispatch_daily(
                repo_url,
                repo_name=repo_name,
                project_id=project_id,
            )
            _log.info(
                "proactive dispatch for %s::%s -> %s",
                repo_url,
                project_id or "",
                result.get("status"),
            )
        except Exception:
            _log.exception(
                "proactive dispatch failed for %s::%s",
                repo_url,
                project_id or "",
            )

    threading.Thread(target=_run, name="proactive-dispatch", daemon=True).start()
