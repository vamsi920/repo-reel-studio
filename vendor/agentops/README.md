# AgentOps (vendored)

Upstream: https://github.com/AgentOps-AI/agentops
Commit: `f8e907b92dabe47232978023fdcb01e2a7d4b752`
License: MIT — see `LICENSE` (© 2023 AgentOps-AI)

This is a **very partial** vendor drop: only the semantic-convention
vocabulary, ported from Python to ESM JavaScript. It gives NeoDevEx's AgentOps
Control Tower a standard, non-invented set of span kinds and attribute names,
aligned with the OpenTelemetry GenAI conventions. See `THIRD_PARTY_NOTICES.md`
for the formal notice and `AGENTS.md` ("AgentOps Control Tower") for the
integration design.

## Licensing notes — READ BEFORE VENDORING MORE

Upstream is **not** uniformly licensed. Verify per directory; do not assume the
root `LICENSE` covers everything:

| Upstream path | License | Status here |
| --- | --- | --- |
| root `LICENSE`, `agentops/` (the Python SDK) | **MIT** | vendorable — this drop |
| `app/` (`dashboard/`, `api/`, `opentelemetry-collector/`, `landing/`, `clickhouse/`, `supabase/`, …) | **Elastic License 2.0** (`app/LICENSE`) | **NOT vendored, and must not be** |

The AgentOps dashboard, its session-replay UI, its FastAPI backend and its
OTel collector all live under `app/` and are therefore ELv2 — source-available,
with a prohibition on offering the software as a hosted/managed service to
third parties. NeoDevEx treats everything in `app/` as **concepts only**: the
run-timeline waterfall, span tree and per-span attribute inspector in
`src/components/features/agentops/` were written from scratch against the shape
of that UI. No ELv2 code, markup, or styling was copied.

## Layout

| Path | Upstream origin |
| --- | --- |
| `semconv/agent.mjs` | `agentops/semconv/agent.py` |
| `semconv/core.mjs` | `agentops/semconv/core.py` |
| `semconv/enum.mjs` | `agentops/semconv/enum.py` |
| `semconv/instrumentation.mjs` | `agentops/semconv/instrumentation.py` |
| `semconv/span-attributes.mjs` | `agentops/semconv/span_attributes.py` |
| `semconv/span-kinds.mjs` | `agentops/semconv/span_kinds.py` |
| `semconv/status.mjs` | `agentops/semconv/status.py` |
| `semconv/tool.mjs` | `agentops/semconv/tool.py` |
| `semconv/workflow.mjs` | `agentops/semconv/workflow.py` |

## Local modifications

- **Python → ESM JavaScript port.** Upstream's attribute classes and `Enum`
  subclasses become `Object.freeze({...})` constants. Every ported attribute
  keeps its upstream string value verbatim — the wire vocabulary is unchanged.
  JavaScript rather than TypeScript because the only consumer is the Node
  collector (`scripts/agentops-server.mjs`); the browser receives spans as JSON
  with these attribute keys already applied.
- **`snake_case.py` → `kebab-case.mjs`** filenames, to match this repo.
- `span_kinds.py`'s legacy `SpanKind` back-compat class was dropped (upstream
  marks it deprecated in favour of `AgentOpsSpanKindValues`).
- `agent.py`'s `AGENT_REASONING` was deliberately **not** ported. NeoDevEx never
  persists agent chain-of-thought; `scripts/agentops/map-events.mjs` strips
  `thought`, `reasoning_content` and `thinking_blocks` before anything is
  stored, and there is a test asserting that.
- `span_attributes.py` and `workflow.py` were reduced to the attributes
  NeoDevEx has a real source for. Nothing was renamed or invented.
- No upstream logic was ported — these files contain no behaviour, only names.

## What was intentionally NOT vendored

- All of `app/` — Elastic License 2.0, see above.
- `agentops/` beyond `semconv/`: the SDK client, exporters, and the
  `instrumentation/` auto-instrumentors. The AgentOps SDK instruments the
  *agent process*, and NeoDevEx's agent runtime is an external, upstream
  OpenHands agent-server that already emits per-LLM-call token, cost and
  latency metrics. Running the SDK inside it would instrument every LLM call
  twice. NeoDevEx maps agent-server's native events into this vocabulary
  instead.
- `semconv/message.py` — per-message prompt/completion **content** attributes.
  The Control Tower stores actions, tool calls, outputs and summaries, not
  conversation content, so there is nothing to put in them.
- `semconv/langchain.py`, `semconv/meters.py`, `semconv/resource.py` — no
  LangChain, no OTel meter pipeline, no host-resource collection here.

## How to update

1. `gh repo clone AgentOps-AI/agentops -- --depth 1` into a scratch directory.
2. Re-check `LICENSE` **and** `app/LICENSE` — the split above is the whole
   reason this drop is so small. If upstream relicenses `app/`, that is a
   product decision, not a mechanical update.
3. Diff `agentops/semconv/*.py` against `semconv/*.mjs` here. Attribute *values*
   are the contract; a changed value is a breaking telemetry change and needs a
   migration for stored spans under `~/.neodevex/agentops/`.
4. Update the commit SHA above and in `THIRD_PARTY_NOTICES.md`.
