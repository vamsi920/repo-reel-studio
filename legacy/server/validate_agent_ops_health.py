#!/usr/bin/env python3
"""Agent Ops + proactive health diagnostics (pass 28/40)."""

from __future__ import annotations

import sys
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))

from agent_ops_health import (  # noqa: E402
    build_agent_api_health,
    build_node_local_ingestion_health,
    build_node_proxy_ingestion_health,
    build_python_ingestion_health,
)


def _fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    raise SystemExit(1)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        _fail(message)


def main() -> int:
    agent = build_agent_api_health()
    _assert(agent["agentRuns"]["writes"] == "full", "agent api writes full")
    _assert(agent["proactive"]["routesAvailable"] is True, "agent api proactive routes")

    py_ingest = build_python_ingestion_health()
    _assert(py_ingest["ingestionMode"] == "python", "python ingestion mode")
    _assert(py_ingest["proactive"]["writes"] == "full", "python proactive writes")

    local = build_node_local_ingestion_health()
    _assert(local["agentRuns"]["mode"] == "local-read-only", "node local mode")
    _assert(local["proactive"]["writes"] == "read-only", "node local proactive read-only")

    proxy = build_node_proxy_ingestion_health(
        "http://127.0.0.1:8788",
        agent,
        agent_reachable=True,
    )
    _assert(proxy["agentRuns"]["writes"] == "full", "proxy inherits upstream agent writes")
    _assert(proxy["proactive"]["writes"] == "full", "proxy inherits upstream proactive writes")
    _assert(proxy["proactive"]["routesAvailable"] is True, "proxy proactive routes")

    proxy_default = build_node_proxy_ingestion_health(
        "http://127.0.0.1:8788",
        None,
        agent_reachable=True,
    )
    _assert(proxy_default["agentRuns"]["writes"] == "proxied", "proxy without upstream defaults to proxied")

    degraded = build_node_proxy_ingestion_health("http://127.0.0.1:8788", None, agent_reachable=False)
    _assert(degraded["status"] == "degraded", "unreachable proxy is degraded")
    _assert(degraded["agentRuns"]["connected"] is False, "proxy not connected")

    print("OK: agent ops health diagnostics")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
