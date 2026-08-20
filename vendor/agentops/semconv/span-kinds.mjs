/**
 * Span kinds for AgentOps.
 *
 * Vendored from `agentops/semconv/span_kinds.py` (MIT). Upstream's legacy
 * `SpanKind` compatibility class was not ported — nothing here consumes it.
 */

export const AgentOpsSpanKindValues = Object.freeze({
  WORKFLOW: "workflow",
  SESSION: "session",
  TASK: "task",
  OPERATION: "operation",
  AGENT: "agent",
  TOOL: "tool",
  LLM: "llm",
  CHAIN: "chain",
  TEXT: "text",
  GUARDRAIL: "guardrail",
  HTTP: "http",
  UNKNOWN: "unknown",
});

