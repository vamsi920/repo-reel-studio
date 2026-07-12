"""
Stateless, deterministic policy evaluator (AGT-compatible shape).

Mirrors the `PolicyEvaluator` / `PolicyDocument` / `PolicyRule` API from the
Microsoft agent-governance-toolkit so call sites read the same and we can swap in
the real package later. Pure stdlib; no I/O here (audit lives in audit.py).
"""
from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Sequence


class PolicyAction(str, Enum):
    ALLOW = "allow"
    DENY = "deny"
    REQUIRE_APPROVAL = "require_approval"


class PolicyOperator(str, Enum):
    EQ = "eq"
    NEQ = "neq"
    IN = "in"
    NOT_IN = "not_in"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    REGEX = "regex"
    GLOB = "glob"
    GT = "gt"
    LT = "lt"
    EXISTS = "exists"
    TRUTHY = "truthy"


@dataclass
class PolicyCondition:
    """A single field test, or a compound all/any of nested conditions."""

    field: Optional[str] = None
    operator: PolicyOperator = PolicyOperator.EXISTS
    value: Any = None
    all_of: Optional[Sequence["PolicyCondition"]] = None
    any_of: Optional[Sequence["PolicyCondition"]] = None

    def matches(self, context: dict[str, Any]) -> bool:
        if self.all_of:
            return all(cond.matches(context) for cond in self.all_of)
        if self.any_of:
            return any(cond.matches(context) for cond in self.any_of)
        return self._match_leaf(context)

    def _match_leaf(self, context: dict[str, Any]) -> bool:
        actual = _resolve_field(context, self.field) if self.field else None
        op = self.operator
        expected = self.value

        if op is PolicyOperator.EXISTS:
            return actual is not None
        if op is PolicyOperator.TRUTHY:
            return bool(actual)
        if op is PolicyOperator.EQ:
            return actual == expected
        if op is PolicyOperator.NEQ:
            return actual != expected
        if op is PolicyOperator.IN:
            return actual in (expected or [])
        if op is PolicyOperator.NOT_IN:
            return actual not in (expected or [])
        if op is PolicyOperator.CONTAINS:
            return _contains(actual, expected)
        if op is PolicyOperator.NOT_CONTAINS:
            return not _contains(actual, expected)
        if op is PolicyOperator.STARTS_WITH:
            return isinstance(actual, str) and actual.startswith(str(expected))
        if op is PolicyOperator.ENDS_WITH:
            return isinstance(actual, str) and actual.endswith(str(expected))
        if op is PolicyOperator.REGEX:
            return isinstance(actual, str) and re.search(str(expected), actual) is not None
        if op is PolicyOperator.GLOB:
            return isinstance(actual, str) and fnmatch.fnmatch(actual, str(expected))
        if op is PolicyOperator.GT:
            return _safe_num(actual) is not None and _safe_num(expected) is not None and _safe_num(actual) > _safe_num(expected)  # type: ignore[operator]
        if op is PolicyOperator.LT:
            return _safe_num(actual) is not None and _safe_num(expected) is not None and _safe_num(actual) < _safe_num(expected)  # type: ignore[operator]
        return False


@dataclass
class PolicyRule:
    name: str
    action: PolicyAction
    condition: Optional[PolicyCondition] = None
    priority: int = 0
    description: str = ""
    approvers: list[str] = field(default_factory=list)


@dataclass
class PolicyDefaults:
    action: PolicyAction = PolicyAction.ALLOW


@dataclass
class PolicyDocument:
    name: str
    version: str = "1.0"
    defaults: PolicyDefaults = field(default_factory=PolicyDefaults)
    rules: list[PolicyRule] = field(default_factory=list)


@dataclass
class PolicyDecision:
    action: PolicyAction
    rule_name: Optional[str]
    reason: str
    approvers: list[str] = field(default_factory=list)
    policy_name: Optional[str] = None

    @property
    def allowed(self) -> bool:
        return self.action is PolicyAction.ALLOW

    @property
    def denied(self) -> bool:
        return self.action is PolicyAction.DENY

    @property
    def needs_approval(self) -> bool:
        return self.action is PolicyAction.REQUIRE_APPROVAL

    def to_dict(self) -> dict[str, Any]:
        return {
            "action": self.action.value,
            "rule": self.rule_name,
            "reason": self.reason,
            "approvers": list(self.approvers),
            "policy": self.policy_name,
        }


class PolicyEvaluator:
    """Highest-priority matching rule wins; otherwise the policy default applies."""

    def __init__(self, policies: Sequence[PolicyDocument], *, fail_closed: bool = False):
        self.policies = list(policies)
        self.fail_closed = fail_closed

    def evaluate(self, context: dict[str, Any]) -> PolicyDecision:
        best: Optional[tuple[int, PolicyRule, PolicyDocument]] = None
        for doc in self.policies:
            for rule in doc.rules:
                try:
                    if rule.condition is None or rule.condition.matches(context):
                        if best is None or rule.priority > best[0]:
                            best = (rule.priority, rule, doc)
                except Exception:
                    # A broken rule must never crash enforcement.
                    if self.fail_closed:
                        return PolicyDecision(
                            PolicyAction.DENY, rule.name,
                            f"Rule '{rule.name}' raised during evaluation (fail-closed).",
                            policy_name=doc.name,
                        )
                    continue

        if best is not None:
            _, rule, doc = best
            return PolicyDecision(
                rule.action,
                rule.name,
                rule.description or f"Matched rule '{rule.name}'.",
                approvers=list(rule.approvers),
                policy_name=doc.name,
            )

        if self.policies:
            doc = self.policies[0]
            return PolicyDecision(
                doc.defaults.action,
                None,
                f"No rule matched; applied default '{doc.defaults.action.value}'.",
                policy_name=doc.name,
            )

        action = PolicyAction.DENY if self.fail_closed else PolicyAction.ALLOW
        return PolicyDecision(action, None, "No policy loaded.")


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _resolve_field(context: dict[str, Any], path: Optional[str]) -> Any:
    if not path:
        return None
    if path in context:  # exact dotted key (e.g. "action.type") wins if present
        return context[path]
    cursor: Any = context
    for part in path.split("."):
        if isinstance(cursor, dict) and part in cursor:
            cursor = cursor[part]
        else:
            return None
    return cursor


def _contains(actual: Any, expected: Any) -> bool:
    if actual is None:
        return False
    if isinstance(actual, str):
        return str(expected) in actual
    if isinstance(actual, (list, tuple, set)):
        return expected in actual
    return False


def _safe_num(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# --------------------------------------------------------------------------- #
# Deserialization (from JSON/dict policy documents)
# --------------------------------------------------------------------------- #

def _condition_from_dict(data: Optional[dict[str, Any]]) -> Optional[PolicyCondition]:
    if not data:
        return None
    if "all_of" in data or "any_of" in data:
        return PolicyCondition(
            all_of=[c for c in (_condition_from_dict(x) for x in data.get("all_of", [])) if c] or None,
            any_of=[c for c in (_condition_from_dict(x) for x in data.get("any_of", [])) if c] or None,
        )
    return PolicyCondition(
        field=data.get("field"),
        operator=PolicyOperator(str(data.get("operator", "exists"))),
        value=data.get("value"),
    )


def policy_document_from_dict(data: dict[str, Any]) -> PolicyDocument:
    rules: list[PolicyRule] = []
    for raw in data.get("rules", []) or []:
        rules.append(
            PolicyRule(
                name=str(raw.get("name", "unnamed")),
                action=PolicyAction(str(raw.get("action", "allow"))),
                condition=_condition_from_dict(raw.get("condition")),
                priority=int(raw.get("priority", 0)),
                description=str(raw.get("description", "")),
                approvers=list(raw.get("approvers", []) or []),
            )
        )
    defaults_raw = data.get("defaults") or {}
    return PolicyDocument(
        name=str(data.get("name", "policy")),
        version=str(data.get("version", "1.0")),
        defaults=PolicyDefaults(action=PolicyAction(str(defaults_raw.get("action", "allow")))),
        rules=rules,
    )
