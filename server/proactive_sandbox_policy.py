from __future__ import annotations

import fnmatch
import re
from pathlib import Path
from typing import Any, Optional

DEFAULT_PROACTIVE_SANDBOX_POLICY: dict[str, Any] = {
    "commandAllowlist": [
        "git diff --check",
        "git diff",
        "git status",
        "npm test",
        "npm run lint",
        "npm run build",
        "python -m pytest",
        "pytest",
        "pnpm test",
        "pnpm run lint",
        "yarn test",
        "yarn lint",
    ],
    "pathDenylist": [
        ".git/**",
        ".env*",
        "**/.env*",
        "node_modules/**",
        "dist/**",
        "build/**",
        "coverage/**",
        "**/*.pem",
        "**/*.key",
        "**/secrets/**",
    ],
    "networkPolicy": "restricted — validation and install commands must stay on the runner allowlist",
}

READONLY_GIT_PREFIXES = (
    "git diff",
    "git status",
    "git show",
    "git log",
    "git rev-parse",
)

NETWORK_COMMAND_MARKERS = (
    "curl ",
    "wget ",
    "nc ",
    "ssh ",
    "scp ",
    "npm install ",
    "pnpm install ",
    "yarn add ",
    "pip install ",
)

SENSITIVE_PATH_PATTERNS = [
    re.compile(r"(^|/)(auth|session|login|permission|access)(/|\.|$)", re.I),
    re.compile(r"(^|/)(db|database|schema|migration|seed)(/|\.|$)", re.I),
    re.compile(r"(^|/)(security|secret|token|credential)(/|\.|$)", re.I),
    re.compile(r"(^|/)\.github(/|$)", re.I),
    re.compile(r"(^|/)(infra|deploy|docker|terraform|k8s|helm)(/|\.|$)", re.I),
    re.compile(r"\.(pem|key|crt|p12)$", re.I),
]


def normalize_repo_path(path: str) -> str:
    normalized = (path or "").replace("\\", "/").strip()
    while normalized.startswith("./"):
        normalized = normalized[2:]
    return normalized


def is_sensitive_path(path: str) -> bool:
    normalized = normalize_repo_path(path)
    if not normalized:
        return False
    return any(pattern.search(normalized) for pattern in SENSITIVE_PATH_PATTERNS)


def path_matches_deny_pattern(path: str, pattern: str) -> bool:
    normalized = normalize_repo_path(path)
    if not normalized or not pattern:
        return False
    raw = pattern.strip()
    if raw in normalized or raw.lstrip("./") in normalized:
        return True
    glob_pattern = raw.replace("**/", "*/").replace("**", "*")
    if fnmatch.fnmatch(normalized, glob_pattern):
        return True
    if fnmatch.fnmatch(f"/{normalized}", glob_pattern if glob_pattern.startswith("/") else f"*/{glob_pattern}"):
        return True
    return False


def merge_sandbox_policy(run: dict[str, Any], workspace: Path) -> dict[str, Any]:
    from agent_runs import load_repo_policy

    merged = {
        "commandAllowlist": list(DEFAULT_PROACTIVE_SANDBOX_POLICY["commandAllowlist"]),
        "pathDenylist": list(DEFAULT_PROACTIVE_SANDBOX_POLICY["pathDenylist"]),
        "networkPolicy": DEFAULT_PROACTIVE_SANDBOX_POLICY["networkPolicy"],
        "forbiddenPaths": [],
        "maxFilesChanged": 15,
        "requiredChecks": [],
    }
    run_policy = run.get("policy") if isinstance(run.get("policy"), dict) else {}
    for key in ("commandAllowlist", "pathDenylist", "networkPolicy"):
        value = run_policy.get(key)
        if value:
            merged[key] = list(value) if isinstance(value, list) else value

    repo_policy = load_repo_policy(workspace)
    merged["maxFilesChanged"] = repo_policy.get("maxFilesChanged", merged["maxFilesChanged"])
    merged["requiredChecks"] = list(repo_policy.get("requiredChecks") or [])
    forbidden = set(str(item) for item in (repo_policy.get("forbiddenPaths") or []) if str(item).strip())
    for pattern in merged["pathDenylist"]:
        forbidden.add(str(pattern))
    merged["forbiddenPaths"] = sorted(forbidden)
    return merged


def annotate_changed_files(changed_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    annotated: list[dict[str, Any]] = []
    for item in changed_files or []:
        if not isinstance(item, dict):
            continue
        row = dict(item)
        path = normalize_repo_path(str(row.get("path") or ""))
        if path:
            row["path"] = path
            row["sensitive"] = bool(row.get("sensitive")) or is_sensitive_path(path)
        annotated.append(row)
    return annotated


def command_allowed(command: str, allowlist: list[str]) -> bool:
    cmd = " ".join(str(command or "").strip().split())
    if not cmd:
        return False
    lowered = cmd.lower()
    if any(lowered.startswith(prefix) for prefix in READONLY_GIT_PREFIXES):
        return True
    for allowed in allowlist:
        token = " ".join(str(allowed or "").strip().split())
        if not token:
            continue
        if cmd == token or cmd.startswith(f"{token} "):
            return True
    return False


def audit_validation_commands(
    validation: Optional[dict[str, Any]],
    policy: dict[str, Any],
) -> list[str]:
    violations: list[str] = []
    allowlist = [str(item) for item in (policy.get("commandAllowlist") or []) if str(item).strip()]
    network_policy = str(policy.get("networkPolicy") or "").lower()
    restricted_network = "restricted" in network_policy

    commands = []
    if isinstance(validation, dict):
        commands = validation.get("commands") or []
    for entry in commands:
        if not isinstance(entry, dict):
            continue
        cmd = str(entry.get("command") or "").strip()
        if not cmd:
            continue
        if not command_allowed(cmd, allowlist):
            violations.append(f"Validation command not on proactive allowlist: {cmd}")
        if restricted_network and any(marker in cmd.lower() for marker in NETWORK_COMMAND_MARKERS):
            violations.append(f"Network/install command blocked by proactive networkPolicy: {cmd}")
    return violations


def audit_changed_file_paths(
    changed_files: list[dict[str, Any]],
    policy: dict[str, Any],
) -> list[str]:
    violations: list[str] = []
    deny_patterns = [str(item) for item in (policy.get("pathDenylist") or []) if str(item).strip()]
    forbidden = [str(item) for item in (policy.get("forbiddenPaths") or []) if str(item).strip()]

    for row in changed_files:
        path = normalize_repo_path(str(row.get("path") or ""))
        if not path:
            continue
        for pattern in deny_patterns:
            if path_matches_deny_pattern(path, pattern):
                violations.append(f"Changed file {path} matches proactive pathDenylist pattern '{pattern}'.")
                break
        for pattern in forbidden:
            if pattern in path or path_matches_deny_pattern(path, pattern):
                violations.append(f"Changed file {path} matches forbidden path '{pattern}'.")
                break
    return violations


def collect_sensitive_paths(changed_files: list[dict[str, Any]]) -> list[str]:
    paths: list[str] = []
    for row in changed_files:
        path = normalize_repo_path(str(row.get("path") or ""))
        if path and (row.get("sensitive") or is_sensitive_path(path)):
            paths.append(path)
    return sorted(dict.fromkeys(paths))


def dedupe_violations(violations: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for item in violations:
        text = str(item).strip()
        if not text or text in seen:
            continue
        seen.add(text)
        ordered.append(text)
    return ordered


def build_policy_artifacts(
    policy: dict[str, Any],
    *,
    violations: list[str],
    sensitive_paths: list[str],
    command_violations: list[str],
    path_violations: list[str],
) -> dict[str, Any]:
    return {
        "sandboxPolicy": {
            "commandAllowlist": list(policy.get("commandAllowlist") or []),
            "pathDenylist": list(policy.get("pathDenylist") or []),
            "networkPolicy": policy.get("networkPolicy"),
            "sensitivePaths": sensitive_paths,
            "forbiddenPaths": list(policy.get("forbiddenPaths") or []),
        },
        "policyAudit": {
            "violations": violations,
            "commandViolations": command_violations,
            "pathViolations": path_violations,
            "sensitiveFileCount": len(sensitive_paths),
        },
    }


def enforce_proactive_sandbox_policy(
    run: dict[str, Any],
    changed_files: list[dict[str, Any]],
    validation: Optional[dict[str, Any]],
    workspace: Path,
    *,
    quality_gates: Optional[dict[str, Any]] = None,
    evaluation: Optional[dict[str, Any]] = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[str]]:
    from agent_runs import enforce_policy_gates, load_repo_policy

    policy = merge_sandbox_policy(run, workspace)
    annotated = annotate_changed_files(changed_files)

    path_violations = audit_changed_file_paths(annotated, policy)
    command_violations = audit_validation_commands(validation, policy)
    repo_policy = load_repo_policy(workspace)
    repo_violations = enforce_policy_gates(
        repo_policy,
        annotated,
        quality_gates or {"gates": []},
        evaluation or {},
    )

    violations = dedupe_violations([*path_violations, *command_violations, *repo_violations])
    sensitive_paths = collect_sensitive_paths(annotated)

    run = dict(run)
    run["policy"] = {
        "commandAllowlist": policy["commandAllowlist"],
        "pathDenylist": policy["pathDenylist"],
        "networkPolicy": policy["networkPolicy"],
    }
    run["policyViolations"] = violations
    artifacts = run.setdefault("artifacts", {})
    artifacts.update(
        build_policy_artifacts(
            policy,
            violations=violations,
            sensitive_paths=sensitive_paths,
            command_violations=command_violations,
            path_violations=path_violations,
        )
    )
    artifacts["changedFiles"] = annotated
    notes = artifacts.setdefault("validation", {}).setdefault("notes", [])
    if violations:
        summary = f"[proactive:policy] {len(violations)} sandbox policy violation(s) recorded."
        if summary not in notes:
            notes.append(summary)
    if sensitive_paths:
        sensitive_note = f"[proactive:policy] Sensitive paths touched: {', '.join(sensitive_paths[:6])}"
        if sensitive_note not in notes:
            notes.append(sensitive_note)
    return run, annotated, violations


def sync_policy_metadata_to_candidate(
    candidate: dict[str, Any],
    run: dict[str, Any],
) -> dict[str, Any]:
    from proactive_policy_visibility import assess_policy_visibility, merge_policy_review_metadata

    artifacts = run.get("artifacts") if isinstance(run.get("artifacts"), dict) else {}
    sandbox = artifacts.get("sandboxPolicy") if isinstance(artifacts.get("sandboxPolicy"), dict) else {}
    audit = artifacts.get("policyAudit") if isinstance(artifacts.get("policyAudit"), dict) else {}
    violations = [str(item).strip() for item in (run.get("policyViolations") or []) if str(item).strip()]
    sensitive_paths = list(sandbox.get("sensitivePaths") or collect_sensitive_paths(artifacts.get("changedFiles") or []))

    candidate = dict(candidate)
    metadata = dict(candidate.get("reviewMetadata") or {})
    metadata["sandboxPolicy"] = sandbox
    metadata["policyAudit"] = audit
    visibility = assess_policy_visibility(violations=violations, sensitive_paths=sensitive_paths)
    metadata = merge_policy_review_metadata(metadata, visibility)
    candidate["reviewMetadata"] = metadata
    candidate["policyStatus"] = visibility["policyStatus"]
    candidate["policySummary"] = visibility["policySummary"]
    candidate["policyViolations"] = list(visibility["policyViolations"])
    candidate["policyWarnings"] = list(visibility["policyWarnings"])
    candidate["prApprovalBlocked"] = bool(visibility["prApprovalBlocked"])
    candidate["prPromotionDiscouraged"] = bool(visibility["prPromotionDiscouraged"])
    return candidate
