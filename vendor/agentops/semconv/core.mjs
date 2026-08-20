/**
 * Core attributes applicable to all spans.
 *
 * Vendored from `agentops/semconv/core.py` (MIT).
 */

export const CoreAttributes = Object.freeze({
  /** Type of error if status is error. */
  ERROR_TYPE: "error.type",
  /** Error message if status is error. */
  ERROR_MESSAGE: "error.message",

  /** Tags passed to agentops.init. */
  TAGS: "agentops.tags",

  TRACE_ID: "trace.id",
  SPAN_ID: "span.id",
  PARENT_ID: "parent.id",
  GROUP_ID: "group.id",
});
