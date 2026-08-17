"""Local deterministic Layman-style prose compression for Agent Ops prompts."""

from __future__ import annotations

import re

SENSITIVE_BASENAME_RE = re.compile(
    r"^(?:\.env(?:\..+)?|\.netrc|credentials(?:\..+)?|secrets?(?:\..+)?|"
    r"passwords?(?:\..+)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|authorized_keys|"
    r"known_hosts|.*\.(?:pem|key|p12|pfx|crt|cer|jks|keystore|asc|gpg))$",
    re.I,
)
SENSITIVE_PATH_PARTS = {".ssh", ".aws", ".gnupg", ".kube", ".docker"}

COMMAND_PREFIX_RE = re.compile(
    r"^(npm|pnpm|yarn|bun|node|python3?|pip|uv|npx|git|docker|kubectl|make|bash|sh)\b",
    re.I,
)
DIFF_LINE_RE = re.compile(r"^(---|\+\+\+|@@|[+-])")
STRUCTURED_KV_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
URL_RE = re.compile(r"https?://\S+")
PATH_RE = re.compile(r"(?:\.\/|\.\.\/|\/|[A-Za-z]:\\)[\w\-/\\.]+")
LINE_NUMBER_RE = re.compile(r"(?:\bline\s+\d+\b|\bL\d{1,6}\b|:\d{1,6}(?::\d{1,6})?)", re.I)

FILLER_RE = re.compile(
    r"\b(?:just|really|basically|actually|simply|essentially|generally|please|sure|certainly)\b",
    re.I,
)
PHRASE_REPLACERS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bin order to\b", re.I), "to"),
    (re.compile(r"\bmake sure to\b", re.I), "ensure"),
    (re.compile(r"\byou could consider\b", re.I), ""),
    (re.compile(r"\bit would be good to\b", re.I), ""),
    (re.compile(r"\bthe reason is because\b", re.I), "because"),
    (re.compile(r"\bthis is basically\b", re.I), "this is"),
]


def _basename(path: str) -> str:
    normalized = path.replace("\\", "/")
    parts = [p for p in normalized.split("/") if p]
    return parts[-1] if parts else path


def is_sensitive_path(path: str) -> bool:
    name = _basename(path)
    if SENSITIVE_BASENAME_RE.match(name):
        return True
    parts = path.replace("\\", "/").lower().split("/")
    if any(part in SENSITIVE_PATH_PARTS for part in parts):
        return True
    collapsed = name.lower().replace("_", "").replace("-", "").replace(".", "")
    for token in ("secret", "credential", "password", "apikey", "token", "privatekey"):
        if token in collapsed:
            return True
    return False


def _should_preserve_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    if stripped.startswith("#"):
        return True
    if stripped.startswith("```"):
        return True
    if stripped.startswith("{") or stripped.startswith("["):
        return True
    if DIFF_LINE_RE.match(stripped):
        return True
    if STRUCTURED_KV_RE.match(stripped):
        return True
    if COMMAND_PREFIX_RE.match(stripped):
        return True
    if URL_RE.search(stripped):
        return True
    if PATH_RE.search(stripped) and ("/" in stripped or stripped.startswith("./")):
        return True
    if LINE_NUMBER_RE.search(stripped):
        return True
    if re.match(r"^\d+[\.\)]\s", stripped):
        return True
    if stripped.startswith("- ") and ("=" in stripped or "/" in stripped or "://" in stripped):
        return True
    return False


def _compress_prose_line(line: str) -> str:
    out = line
    for pattern, replacement in PHRASE_REPLACERS:
        out = pattern.sub(replacement, out)
    out = FILLER_RE.sub("", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([,.;:!?])", r"\1", out)
    return out.strip() if out.strip() == line.strip() else out


def compress_prompt_prose_safe(text: str, *, path: str = "prompt.txt") -> str:
    if not text or not text.strip():
        return text
    if is_sensitive_path(path):
        return text

    parts = re.split(r"(```[\s\S]*?```)", text)
    compressed_parts: list[str] = []
    for part in parts:
        if part.startswith("```"):
            compressed_parts.append(part)
            continue
        lines = part.splitlines(keepends=True)
        out_lines: list[str] = []
        for line in lines:
            body = line.rstrip("\r\n")
            suffix = line[len(body) :]
            if _should_preserve_line(body):
                out_lines.append(body + suffix)
            else:
                out_lines.append(_compress_prose_line(body) + suffix)
        compressed_parts.append("".join(out_lines))

    result = "".join(compressed_parts)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip() if result.strip() else text
