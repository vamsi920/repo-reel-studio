import type { AutomationTrigger } from "#/types/automation";

/**
 * Event trigger sources that only work when the deployment says it receives
 * them. GitHub events reach a local install through the GitHub event bridge
 * (scripts/github-event-bridge.mjs), which the launcher starts together with
 * the backend's `github` event source; a deployment without it advertises no
 * `github` in its capabilities, and an automation built on it would be shown
 * "Active" while nothing ever delivers the event.
 */
const CAPABILITY_GATED_EVENT_SOURCES = new Set(["github"]);

/**
 * True when this event trigger cannot fire on the current deployment.
 *
 * `supportedSources` is the deployment's advertised `eventSources`
 * (`GET /v1/capabilities`). When it is not known yet, gated sources are
 * treated as unsupported -- the safe answer for a badge that warns users.
 */
export function isUnsupportedEventTrigger(
  trigger: Pick<AutomationTrigger, "type" | "source">,
  supportedSources?: readonly string[] | null,
): boolean {
  if (trigger.type !== "event" || !trigger.source) return false;
  if (!CAPABILITY_GATED_EVENT_SOURCES.has(trigger.source)) return false;
  return !supportedSources?.includes(trigger.source);
}
