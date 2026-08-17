from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from typing import Any, Callable, Optional, TypeVar

from agent_runs import CancelledRunError, read_run

T = TypeVar("T")

DEFAULT_EXECUTOR_TIMEOUT_SECONDS = 1200
MIN_EXECUTOR_TIMEOUT_SECONDS = 60
MAX_EXECUTOR_TIMEOUT_SECONDS = 7200

BLOCKED_PR_APPROVAL = [
    "PR approval is blocked until a new sandbox execution produces a patch.",
    "Cancelled or timed-out runs cannot be promoted to a pull request.",
]


class ProactiveExecutionTimeout(Exception):
    pass


def proactive_executor_timeout_seconds() -> int:
    raw = os.getenv("PROACTIVE_EXECUTOR_TIMEOUT_SECONDS", "").strip()
    if not raw:
        return DEFAULT_EXECUTOR_TIMEOUT_SECONDS
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_EXECUTOR_TIMEOUT_SECONDS
    return max(MIN_EXECUTOR_TIMEOUT_SECONDS, min(MAX_EXECUTOR_TIMEOUT_SECONDS, value))


def is_run_cancel_requested(run: Optional[dict[str, Any]]) -> bool:
    if not run:
        return False
    control = run.get("control") or {}
    return bool(control.get("cancelRequested"))


def read_run_cancel_requested(run_id: str) -> bool:
    return is_run_cancel_requested(read_run(run_id))


def guard_proactive_not_cancelled(run_id: str) -> None:
    if read_run_cancel_requested(run_id):
        raise CancelledRunError()


def run_executor_with_timeout(callable: Callable[[], T], *, timeout_seconds: Optional[int] = None) -> T:
    limit = timeout_seconds if timeout_seconds is not None else proactive_executor_timeout_seconds()
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(callable)
        try:
            return future.result(timeout=limit)
        except FuturesTimeoutError as exc:
            raise ProactiveExecutionTimeout(
                f"Proactive executor timed out after {limit}s"
            ) from exc


def candidate_blocks_pr_approval(candidate: dict[str, Any]) -> bool:
    metadata = candidate.get("reviewMetadata") or {}
    if metadata.get("prApprovalBlocked"):
        return True
    stage = str(candidate.get("stage") or "")
    return stage in {"cancelled", "timed_out"}


def execution_outcome_for_exception(exc: BaseException) -> str:
    if isinstance(exc, CancelledRunError):
        return "cancelled"
    if isinstance(exc, ProactiveExecutionTimeout):
        return "timeout"
    message = str(exc).lower()
    if "timed out" in message or "timeout" in message:
        return "timeout"
    if "cancel" in message:
        return "cancelled"
    return "error"
