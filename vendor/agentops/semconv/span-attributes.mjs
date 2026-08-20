/**
 * Span attributes for OpenTelemetry GenAI semantic conventions.
 *
 * Vendored from `agentops/semconv/span_attributes.py` (MIT). Provider-specific
 * groups upstream carries but NeoDevEx has no source for (OpenAI-specific
 * fingerprints, streaming chunk timings, HTTP attributes) are not ported —
 * see `vendor/agentops/README.md`.
 *
 * Reference:
 * https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-spans.md
 */

export const SpanAttributes = Object.freeze({
  // System
  LLM_SYSTEM: "gen_ai.system",

  // Request
  LLM_REQUEST_MODEL: "gen_ai.request.model",
  LLM_REQUEST_MAX_TOKENS: "gen_ai.request.max_tokens",
  LLM_REQUEST_TEMPERATURE: "gen_ai.request.temperature",
  LLM_REQUEST_TOP_P: "gen_ai.request.top_p",
  LLM_REQUEST_TOP_K: "gen_ai.request.top_k",
  LLM_REQUEST_TYPE: "gen_ai.request.type",
  LLM_REQUEST_STREAMING: "gen_ai.request.streaming",

  // Content
  LLM_PROMPTS: "gen_ai.prompt",
  LLM_COMPLETIONS: "gen_ai.completion",

  // Response
  LLM_RESPONSE_MODEL: "gen_ai.response.model",
  LLM_RESPONSE_FINISH_REASON: "gen_ai.response.finish_reason",
  LLM_RESPONSE_STOP_REASON: "gen_ai.response.stop_reason",
  LLM_RESPONSE_ID: "gen_ai.response.id",

  // Usage
  LLM_USAGE_COMPLETION_TOKENS: "gen_ai.usage.completion_tokens",
  LLM_USAGE_PROMPT_TOKENS: "gen_ai.usage.prompt_tokens",
  LLM_USAGE_TOTAL_TOKENS: "gen_ai.usage.total_tokens",
  LLM_USAGE_CACHE_CREATION_INPUT_TOKENS:
    "gen_ai.usage.cache_creation_input_tokens",
  LLM_USAGE_CACHE_READ_INPUT_TOKENS: "gen_ai.usage.cache_read_input_tokens",
  LLM_USAGE_REASONING_TOKENS: "gen_ai.usage.reasoning_tokens",
  LLM_USAGE_TOOL_COST: "gen_ai.usage.total_cost",

  // Token type
  LLM_TOKEN_TYPE: "gen_ai.token.type",

  // User
  LLM_USER: "gen_ai.user",

  // AgentOps specific
  AGENTOPS_ENTITY_INPUT: "agentops.entity.input",
  AGENTOPS_ENTITY_OUTPUT: "agentops.entity.output",
  AGENTOPS_ENTITY_NAME: "agentops.entity.name",
  AGENTOPS_SPAN_KIND: "agentops.span.kind",

  // Operation
  OPERATION_NAME: "operation.name",
  OPERATION_VERSION: "operation.version",

  // Session / trace
  AGENTOPS_SESSION_END_STATE: "agentops.session.end_state",

  // Streaming
  LLM_STREAMING_TIME_TO_GENERATE: "gen_ai.streaming.time_to_generate",
});
