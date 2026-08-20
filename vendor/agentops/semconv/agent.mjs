/**
 * Attributes specific to agent spans.
 *
 * Vendored from `agentops/semconv/agent.py` (MIT). Upstream's `AGENT_REASONING`
 * attribute is deliberately NOT ported: NeoDevEx never persists agent
 * chain-of-thought (see `scripts/agentops/map-events.mjs`).
 */

export const AgentAttributes = Object.freeze({
  /** Unique identifier for the agent. */
  AGENT_ID: "agent.id",
  /** Name of the agent. */
  AGENT_NAME: "agent.name",
  /** Role of the agent. */
  AGENT_ROLE: "agent.role",

  /** Tools available to the agent. */
  AGENT_TOOLS: "agent.tools",
  /** Models available to the agent. */
  AGENT_MODELS: "agent.models",

  TOOLS: "tools",
  HANDOFFS: "handoffs",

  // NOTE (upstream): these two deviate from the OpenTelemetry GenAI semantic
  // conventions, which would name them under the "gen_ai" namespace.
  FROM_AGENT: "from_agent",
  TO_AGENT: "to_agent",
});
