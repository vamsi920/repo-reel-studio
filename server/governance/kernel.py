"""
Governance kernel — the high-level enforcement surface used by agent-ops.

Responsibilities:
- Load the policy document (JSON default, overridable via env).
- Classify agent-driven shell commands into governance flags (destructive,
  remote_exec, secret_access, network, known_validation).
- Evaluate commands and high-level actions (agent.run.start, git.push, pr.create)
  against the policy, with a deterministic fail-closed gate for catastrophic
  patterns that always denies regardless of policy defaults.
- Record every decision to the tamper-evident audit log.

This augments — does not replace — proactive_sandbox_policy / proactive_secret_sanitizer.
"""
from __future__ import annotations

import json
import os
import re
import threading
from pathlib import Path
from typing import Any, Optional, Sequence, Union

from .audit import AuditLog
from .policy_engine import (
    PolicyAction,
    PolicyDecision,
    PolicyDocument,
    PolicyEvaluator,
    policy_document_from_dict,
)

CommandLike = Union[str, Sequence[str]]


class GovernanceDenied(Exception):
    """Raised when an action is denied by policy."""

    def __init__(self, decision: PolicyDecision, subject: str):
        self.decision = decision
        self.subject = subject
        super().__init__(f"Governance denied '{subject}': {decision.reason}")


class GovernanceApprovalRequired(Exception):
    """Raised when an action needs human approval and none was supplied."""

    def __init__(self, decision: PolicyDecision, subject: str):
        self.decision = decision
        self.subject = subject
        super().__init__(f"Governance requires approval for '{subject}': {decision.reason}")


# --------------------------------------------------------------------------- #
# Catastrophic patterns — always denied (fail-closed), independent of policy.
# --------------------------------------------------------------------------- #

_CATASTROPHIC = [
    re.compile(r"\brm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME|\*)", re.I),
    re.compile(r"\brm\s+-[a-z]*f[a-z]*r?\s+(/|~|\$HOME|\*)", re.I),
    re.compile(r":\(\)\s*\{\s*:\|\:&\s*\}"),                 # fork bomb
    re.compile(r"\bmkfs(\.\w+)?\b", re.I),
    re.compile(r"\bdd\b.+\bof=/dev/", re.I),
    re.compile(r">\s*/dev/sd[a-z]", re.I),
    re.compile(r"\bchmod\s+-R\s+0*777\s+/", re.I),
    re.compile(r"\bchown\s+-R\b.+\s+/\s*$", re.I),
    re.compile(r"\b(shutdown|reboot|halt|poweroff)\b", re.I),
    re.compile(r"\b(drop|truncate)\s+table\b", re.I),
    re.compile(r"\bdelete\s+from\b.+\bwhere\b\s+1\s*=\s*1", re.I),
]

# Network-fetch piped into a shell interpreter (classic RCE).
_REMOTE_EXEC = re.compile(
    r"\b(curl|wget|fetch)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b", re.I
)
_BASE64_EXEC = re.compile(r"\bbase64\b[^|]*\|\s*(ba|z)?sh\b", re.I)
_EVAL_DOWNLOAD = re.compile(r"\beval\b.*\$\((curl|wget)", re.I)

# Reading secret material into a command.
_SECRET_ACCESS = re.compile(
    r"(\.env(\.\w+)?\b|/\.ssh/|id_rsa\b|\.pem\b|\.p12\b|/etc/shadow|\bAWS_SECRET|PRIVATE[_-]?KEY)",
    re.I,
)

# Reaches the network to install/fetch.
_NETWORK = re.compile(
    r"\b(pip(3)?\s+install|npm\s+install|npm\s+ci|pnpm\s+(install|add)|yarn\s+(add|install)|"
    r"go\s+get|cargo\s+(add|install)|apt(-get)?\s+install|brew\s+install|curl|wget)\b",
    re.I,
)

# Known-good validation commands (test / lint / build / read-only git).
_KNOWN_VALIDATION = re.compile(
    r"^(git\s+(diff|status|show|log|rev-parse|ls-files)|"
    r"(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|build|typecheck)|"
    r"npm\s+test|python3?\s+-m\s+pytest|pytest)\b",
    re.I,
)

# Destructive git that rewrites/erases work.
_DESTRUCTIVE_GIT = re.compile(
    r"\bgit\s+(push\s+.*(--force(?!-with-lease))|reset\s+--hard\s+\S|clean\s+-[a-z]*f[a-z]*d|"
    r"branch\s+-D|update-ref\s+-d)\b",
    re.I,
)


def _to_text(command: CommandLike) -> str:
    if isinstance(command, str):
        return command.strip()
    return " ".join(str(part) for part in command).strip()


def classify_command(command: CommandLike) -> dict[str, Any]:
    text = _to_text(command)
    destructive = bool(_DESTRUCTIVE_GIT.search(text)) or any(p.search(text) for p in _CATASTROPHIC)
    return {
        "command": text,
        "flags": {
            "destructive": destructive,
            "remote_exec": bool(_REMOTE_EXEC.search(text) or _BASE64_EXEC.search(text) or _EVAL_DOWNLOAD.search(text)),
            "secret_access": bool(_SECRET_ACCESS.search(text)),
            "network": bool(_NETWORK.search(text)),
            "known_validation": bool(_KNOWN_VALIDATION.search(text)),
        },
    }


# --------------------------------------------------------------------------- #
# Kernel
# --------------------------------------------------------------------------- #

class GovernanceKernel:
    def __init__(self, policy_path: Optional[str] = None, audit: Optional[AuditLog] = None):
        self.policy_path = policy_path or os.getenv(
            "GOVERNANCE_POLICY_PATH",
            str(Path(__file__).resolve().parent / "policies" / "proactive.json"),
        )
        self.policy_doc = self._load_policy(self.policy_path)
        self.evaluator = PolicyEvaluator([self.policy_doc], fail_closed=True)
        self.audit = audit or AuditLog()

    @staticmethod
    def _load_policy(path: str) -> PolicyDocument:
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            return policy_document_from_dict(data)
        except (OSError, ValueError) as exc:  # fall back to a safe built-in policy
            print(f"⚠️  Governance: failed to load policy '{path}' ({exc}); using built-in default.")
            return policy_document_from_dict(_BUILTIN_POLICY)

    # -- command governance ----------------------------------------------- #

    def evaluate_command(self, command: CommandLike, context: Optional[dict[str, Any]] = None) -> PolicyDecision:
        classified = classify_command(command)
        ctx: dict[str, Any] = {
            "action.type": "command",
            "tool_name": "shell",
            "command": classified["command"],
            "flags": classified["flags"],
        }
        if context:
            ctx.update(context)

        decision = self.evaluator.evaluate(ctx)
        self.audit.record(
            decision=decision.action.value,
            action_type="command",
            subject=classified["command"],
            reason=decision.reason,
            rule=decision.rule_name,
            policy=decision.policy_name,
            context=ctx,
        )
        return decision

    def govern_command(self, command: CommandLike, context: Optional[dict[str, Any]] = None) -> PolicyDecision:
        """Evaluate and raise GovernanceDenied if blocked. require_approval passes here
        (the proactive flow performs human approval separately) but is audited."""
        decision = self.evaluate_command(command, context)
        if decision.denied:
            raise GovernanceDenied(decision, _to_text(command))
        return decision

    # -- action governance ------------------------------------------------ #

    def evaluate_action(
        self,
        action_type: str,
        subject: str,
        context: Optional[dict[str, Any]] = None,
        *,
        human_approved: bool = False,
    ) -> PolicyDecision:
        ctx: dict[str, Any] = {"action.type": action_type, "tool_name": action_type}
        if context:
            ctx.update(context)
        decision = self.evaluator.evaluate(ctx)
        self.audit.record(
            decision=("human_approved" if (decision.needs_approval and human_approved) else decision.action.value),
            action_type=action_type,
            subject=subject,
            reason=decision.reason,
            rule=decision.rule_name,
            policy=decision.policy_name,
            context=ctx,
        )
        return decision

    def govern_action(
        self,
        action_type: str,
        subject: str,
        context: Optional[dict[str, Any]] = None,
        *,
        human_approved: bool = False,
    ) -> PolicyDecision:
        decision = self.evaluate_action(action_type, subject, context, human_approved=human_approved)
        if decision.denied:
            raise GovernanceDenied(decision, subject)
        if decision.needs_approval and not human_approved:
            raise GovernanceApprovalRequired(decision, subject)
        return decision

    # -- introspection ---------------------------------------------------- #

    def policy_summary(self) -> dict[str, Any]:
        return {
            "name": self.policy_doc.name,
            "version": self.policy_doc.version,
            "default_action": self.policy_doc.defaults.action.value,
            "rule_count": len(self.policy_doc.rules),
            "rules": [
                {
                    "name": r.name,
                    "action": r.action.value,
                    "priority": r.priority,
                    "description": r.description,
                    "approvers": r.approvers,
                }
                for r in sorted(self.policy_doc.rules, key=lambda r: -r.priority)
            ],
            "source": self.policy_path,
        }


# Minimal built-in fallback if the JSON policy file is missing/corrupt.
_BUILTIN_POLICY: dict[str, Any] = {
    "name": "builtin-fallback",
    "version": "1.0",
    "defaults": {"action": "allow"},
    "rules": [
        {"name": "deny-destructive", "action": "deny", "priority": 100,
         "condition": {"field": "flags.destructive", "operator": "truthy"}},
        {"name": "deny-remote-exec", "action": "deny", "priority": 100,
         "condition": {"field": "flags.remote_exec", "operator": "truthy"}},
        {"name": "deny-secret-access", "action": "deny", "priority": 95,
         "condition": {"field": "flags.secret_access", "operator": "truthy"}},
        {"name": "approve-pr", "action": "require_approval", "priority": 80, "approvers": ["maintainer"],
         "condition": {"field": "action.type", "operator": "eq", "value": "pr.create"}},
        {"name": "approve-push", "action": "require_approval", "priority": 80, "approvers": ["maintainer"],
         "condition": {"field": "action.type", "operator": "eq", "value": "git.push"}},
    ],
}


_kernel_singleton: Optional[GovernanceKernel] = None
_kernel_lock = threading.Lock()


def get_kernel() -> GovernanceKernel:
    global _kernel_singleton
    if _kernel_singleton is None:
        with _kernel_lock:
            if _kernel_singleton is None:
                _kernel_singleton = GovernanceKernel()
    return _kernel_singleton
