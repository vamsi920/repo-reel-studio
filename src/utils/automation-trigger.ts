import type { AutomationTrigger } from "#/types/automation";

/**
 * Event trigger sources with no backend webhook receiver in this deployment.
 * An automation built on one of these can be created and toggled "Active" in
 * the UI, but nothing ever delivers the event, so it silently never runs.
 * See the "Fix bugs from GitHub Issues" bug report for the investigation.
 */
const UNSUPPORTED_EVENT_SOURCES = new Set(["github"]);

export function isUnsupportedEventTrigger(
  trigger: Pick<AutomationTrigger, "type" | "source">,
): boolean {
  return (
    trigger.type === "event" &&
    !!trigger.source &&
    UNSUPPORTED_EVENT_SOURCES.has(trigger.source)
  );
}
