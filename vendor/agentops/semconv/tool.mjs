/**
 * Attributes specific to tool spans.
 *
 * Vendored from `agentops/semconv/tool.py` (MIT).
 */

export const ToolAttributes = Object.freeze({
  /** Unique identifier for the tool. */
  TOOL_ID: "tool.id",
  /** Name of the tool. */
  TOOL_NAME: "tool.name",
  /** Description of the tool. */
  TOOL_DESCRIPTION: "tool.description",

  /** Parameters passed to the tool. */
  TOOL_PARAMETERS: "tool.parameters",
  /** Result returned by the tool. */
  TOOL_RESULT: "tool.result",
  /** Status of tool execution. */
  TOOL_STATUS: "tool.status",
});
