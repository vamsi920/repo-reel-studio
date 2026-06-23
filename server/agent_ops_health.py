from __future__ import annotations

import time
from typing import Any, Optional


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def build_capability(
    mode: str,
    *,
    connected: Optional[bool],
    routes_available: bool,
    writes: str,
    proxy_base: Optional[str] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "mode": mode,
        "connected": connected,
        "routesAvailable": routes_available,
        "writes": writes,
    }
    if proxy_base:
        payload["proxyBase"] = proxy_base
    if mode == "proxy":
        payload["agentReachable"] = bool(connected)
    elif mode == "local-read-only":
        payload["agentReachable"] = None
    else:
        payload["agentReachable"] = True if connected is not False else False
    return payload


def build_agent_api_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "agent-runs-api",
        "timestamp": now_iso(),
        "ingestionMode": "agent-api",
        "agentRuns": build_capability(
            "native",
            connected=True,
            routes_available=True,
            writes="full",
        ),
        "proactive": build_capability(
            "native",
            connected=True,
            routes_available=True,
            writes="full",
        ),
        "bugbot": True,
    }


def build_python_ingestion_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "repo-ingestion-server-v3",
        "timestamp": now_iso(),
        "gitingest_available": True,
        "ingestionMode": "python",
        "agentRuns": build_capability(
            "native",
            connected=True,
            routes_available=True,
            writes="full",
        ),
        "proactive": build_capability(
            "native",
            connected=True,
            routes_available=True,
            writes="full",
        ),
    }


def build_node_local_ingestion_health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "repo-ingestion-server",
        "ingestionMode": "fast-node",
        "timestamp": now_iso(),
        "agentRuns": build_capability(
            "local-read-only",
            connected=False,
            routes_available=True,
            writes="read-only",
        ),
        "proactive": build_capability(
            "local-read-only",
            connected=False,
            routes_available=True,
            writes="read-only",
        ),
    }


def _capability_from_upstream(section: Any, *, mode: str, proxy_base: str, connected: bool) -> dict[str, Any]:
    if isinstance(section, dict):
        routes = bool(section.get("routesAvailable", True))
        writes = str(section.get("writes") or "proxied")
        return build_capability(
            mode,
            connected=connected,
            routes_available=routes,
            writes=writes,
            proxy_base=proxy_base,
        )
    return build_capability(
        mode,
        connected=connected,
        routes_available=connected,
        writes="proxied" if connected else "read-only",
        proxy_base=proxy_base,
    )


def build_node_proxy_ingestion_health(
    proxy_base: str,
    upstream: Optional[dict[str, Any]],
    *,
    agent_reachable: bool,
) -> dict[str, Any]:
    base = build_node_local_ingestion_health()
    base["agentRuns"] = _capability_from_upstream(
        (upstream or {}).get("agentRuns"),
        mode="proxy",
        proxy_base=proxy_base,
        connected=agent_reachable,
    )
    base["proactive"] = _capability_from_upstream(
        (upstream or {}).get("proactive"),
        mode="proxy",
        proxy_base=proxy_base,
        connected=agent_reachable,
    )
    if not agent_reachable:
        base["status"] = "degraded"
    return base
