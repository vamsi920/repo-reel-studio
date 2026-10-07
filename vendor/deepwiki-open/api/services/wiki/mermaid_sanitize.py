"""Deterministic fixes for the Mermaid syntax errors LLMs make most often.

Benchmarked on 77 generated diagrams (ky / flask / hono), 36% failed to
parse, almost all for two reasons:

1. Flowchart node labels containing ``(``, ``)``, ``"`` or other shape
   delimiters without being quoted: ``A[compose(middleware)]``.
2. Sequence-diagram activation shorthand (``->>+X`` / ``-->>-X``) that
   deactivates a participant that was never activated.

Both are fixed here without an LLM, so a diagram is never dropped or
rewritten for a mechanical reason. Anything else is left untouched for the
frontend's parse-and-repair pass.
"""

from __future__ import annotations

import re

_FENCE = re.compile(r"```mermaid[ \t]*\n(.*?)```", re.S)

# Node shapes, longest delimiters first so "((" wins over "(".
_SHAPES = [
    ("([", "])"),
    ("[[", "]]"),
    ("[(", ")]"),
    ("((", "))"),
    ("{{", "}}"),
    ("[/", "/]"),
    ("[\\", "\\]"),
    (">", "]"),
    ("[", "]"),
    ("{", "}"),
    ("(", ")"),
]
_NEEDS_QUOTES = re.compile(r'[()\[\]{}"<>|#;]')
_NODE_ID = re.compile(r"(?<![\w\"'])([A-Za-z_][\w-]*)(?=[\[\(\{>])")


def _quote(label: str) -> str:
    label = label.strip()
    if len(label) >= 2 and label[0] == '"' and label[-1] == '"':
        return label
    return '"' + label.replace('"', "#quot;") + '"'


def _close_index(line: str, start: int, open_: str, close: str) -> int:
    """Index of the closing delimiter for a label opened at ``start``."""
    depth = 0
    i = start
    in_quotes = False
    while i < len(line):
        if line[i] == '"':
            in_quotes = not in_quotes
        elif not in_quotes:
            if line.startswith(open_, i) and open_ not in (">",):
                depth += 1
                i += len(open_)
                continue
            if line.startswith(close, i):
                if depth <= 1:
                    return i
                depth -= 1
                i += len(close)
                continue
        i += 1
    return -1


def _quote_flowchart_line(line: str) -> str:
    out = []
    pos = 0
    for m in _NODE_ID.finditer(line):
        if m.start() < pos or line.count('"', pos, m.start()) % 2:
            continue
        after = m.end()
        for open_, close in _SHAPES:
            if not line.startswith(open_, after):
                continue
            # ">" only opens an asymmetric node directly after an id.
            end = _close_index(line, after, open_, close)
            if end == -1:
                break
            label = line[after + len(open_) : end]
            if _NEEDS_QUOTES.search(label.strip().strip('"')) and not (
                label.strip().startswith('"') and label.strip().endswith('"')
            ):
                out.append(line[pos:after] + open_ + _quote(label) + close)
            else:
                out.append(line[pos : end + len(close)])
            # Skip past the whole label either way: text inside it (e.g.
            # "ky.create({...})") must never be re-read as another node.
            pos = end + len(close)
            break
    out.append(line[pos:])
    return "".join(out)


def _quote_edge_labels(line: str) -> str:
    # A -- text (with parens) --> B   /   A -->|text (x)| B
    line = re.sub(
        r"\|([^|\"]*[()\[\]{}][^|\"]*)\|",
        lambda m: "|" + _quote(m.group(1)) + "|",
        line,
    )
    return line


def _fix_flowchart(body: str) -> str:
    lines = body.split("\n")
    fixed = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("subgraph "):
            rest = stripped[len("subgraph ") :]
            if _NEEDS_QUOTES.search(rest) and not rest.startswith('"') and "[" not in rest:
                line = line[: line.index("subgraph ")] + "subgraph " + _quote(rest)
            fixed.append(line)
            continue
        if stripped.startswith(("%%", "classDef", "class ", "style ", "linkStyle", "click ")):
            fixed.append(line)
            continue
        fixed.append(_quote_edge_labels(_quote_flowchart_line(line)))
    return "\n".join(fixed)


_ACTIVATION = re.compile(r"(-{1,2}(?:>>|>|x|\)))([+-])(?=\s*[\w\"])")
_PARTICIPANT = re.compile(r"^(\s*(?:participant|actor)\s+)([^\n]+?)(\s+as\s+.+)?$")


def _fix_sequence(body: str) -> str:
    lines = body.split("\n")
    renames: dict[str, str] = {}
    out = []
    for line in lines:
        stripped = line.strip()
        # Explicit activate/deactivate lines unbalance just as easily; drop
        # them along with the +/- shorthand. Only the activation bars are
        # lost, never a message.
        if re.match(r"^(activate|deactivate)\s", stripped):
            continue
        m = _PARTICIPANT.match(line)
        if m and not m.group(3):
            name = m.group(2).strip()
            if re.search(r"[^\w-]", name) and not name.startswith('"'):
                alias = re.sub(r"\W+", "_", name).strip("_") or "P"
                renames[name] = alias
                line = f"{m.group(1)}{alias} as {name}"
        out.append(_ACTIVATION.sub(r"\1", line))
    text = "\n".join(out)
    for name, alias in sorted(renames.items(), key=lambda kv: -len(kv[0])):
        text = re.sub(
            r"(->>|-->>|->|-->|-x|--x|-\)|--\))\s*" + re.escape(name) + r"\s*:",
            lambda m, a=alias: f"{m.group(1)}{a}:",
            text,
        )
        text = re.sub(
            r"^(\s*)" + re.escape(name) + r"(\s*(?:->>|-->>|->|-->|-x|--x|-\)|--\)))",
            lambda m, a=alias: f"{m.group(1)}{a}{m.group(2)}",
            text,
            flags=re.M,
        )
        text = re.sub(
            r"(Note (?:over|left of|right of)\s+[^:]*?)" + re.escape(name),
            lambda m, a=alias: m.group(1) + a,
            text,
        )
    return text


def sanitize_mermaid(body: str) -> str:
    head = body.lstrip().split("\n", 1)[0].strip().lower()
    if head.startswith(("graph", "flowchart")):
        return _fix_flowchart(body)
    if head.startswith("sequencediagram"):
        return _fix_sequence(body)
    return body


def sanitize_mermaid_blocks(markdown: str) -> str:
    return _FENCE.sub(
        lambda m: "```mermaid\n" + sanitize_mermaid(m.group(1)) + "```", markdown
    )
