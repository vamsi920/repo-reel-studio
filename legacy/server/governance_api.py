"""
Governance visibility API.

Read-only endpoints that surface the active policy, the tamper-evident audit
trail, and a health/compliance summary. Mounted under /api.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter


def create_governance_router() -> APIRouter:
    router = APIRouter()

    @router.get("/governance/health")
    def governance_health() -> dict[str, Any]:
        from governance import get_kernel

        kernel = get_kernel()
        chain = kernel.audit.verify()
        return {
            "status": "ok",
            "policy": {
                "name": kernel.policy_doc.name,
                "version": kernel.policy_doc.version,
                "rules": len(kernel.policy_doc.rules),
                "default_action": kernel.policy_doc.defaults.action.value,
            },
            "audit": {
                "intact": chain["intact"],
                "records": chain["records"],
                "broken_at": chain.get("broken_at"),
            },
        }

    @router.get("/governance/policy")
    def governance_policy() -> dict[str, Any]:
        from governance import get_kernel

        return get_kernel().policy_summary()

    @router.get("/governance/audit")
    def governance_audit(limit: int = 100) -> dict[str, Any]:
        from governance import get_kernel

        kernel = get_kernel()
        safe_limit = max(1, min(500, int(limit)))
        return {
            "verification": kernel.audit.verify(),
            "records": kernel.audit.tail(safe_limit),
        }

    return router
