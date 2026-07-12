"""
Agent Governance layer (vendored).

A small, dependency-free governance kernel modeled on Microsoft's
agent-governance-toolkit (AGT) PolicyEvaluator API. It intercepts agent-driven
actions (shell commands, run starts, PR/push promotions) in deterministic code
*before* they execute, evaluates them against a policy (allow / deny /
require_approval), and writes a tamper-evident audit record for every decision.

Design goals:
- Zero external dependencies (stdlib only) — safe to run fully offline, no
  install/CI risk. The public API mirrors AGT so it can be swapped for the real
  `agent-governance-toolkit` package later with minimal churn.
- Augments (does not replace) the existing proactive sandbox policy and secret
  sanitizer — defense in depth.
- Fail-closed for catastrophic command patterns regardless of policy defaults.
"""
from __future__ import annotations

from .policy_engine import (
    PolicyAction,
    PolicyCondition,
    PolicyDecision,
    PolicyDefaults,
    PolicyDocument,
    PolicyEvaluator,
    PolicyOperator,
    PolicyRule,
)
from .audit import AuditLog
from .kernel import (
    GovernanceApprovalRequired,
    GovernanceDenied,
    GovernanceKernel,
    get_kernel,
)

__all__ = [
    "PolicyAction",
    "PolicyOperator",
    "PolicyCondition",
    "PolicyRule",
    "PolicyDefaults",
    "PolicyDocument",
    "PolicyDecision",
    "PolicyEvaluator",
    "AuditLog",
    "GovernanceKernel",
    "GovernanceDenied",
    "GovernanceApprovalRequired",
    "get_kernel",
]
