/**
 * Attributes specific to instrumentation.
 *
 * Vendored from `agentops/semconv/instrumentation.py` (MIT).
 */

export const InstrumentationAttributes = Object.freeze({
  /** Name of the instrumentation. */
  NAME: "instrumentation.name",
  /** Version of the instrumentation. */
  VERSION: "instrumentation.version",

  /** Name of the library. */
  LIBRARY_NAME: "library.name",
  /** Version of the library. */
  LIBRARY_VERSION: "library.version",

  /** Type of instrumentation. */
  INSTRUMENTATION_TYPE: "instrumentation.type",
});
