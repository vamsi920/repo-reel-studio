import type { ProfileInfo } from "@openhands/typescript-client";
import {
  blendedCostPerMTok,
  lookupModelCapabilities,
} from "#/lib/model-routing/catalog";

/**
 * Work where a stronger model changes the result, not just the speed.
 * Benchmarked against Devin (case-studies/automations, A9/A10): on PR review
 * and issue triage, Gemini 2.5 Flash found the main bug but missed edge cases
 * and knock-on effects that Gemini 2.5 Pro (and Devin) caught.
 */
const DEEP_WORK =
  /\b(review|triage|investigat\w*|root[ -]cause|audit|security|vulnerab\w*|debug\w*|regression|diagnos\w*)\b/i;

/**
 * A saved profile on a frontier-tier model to suggest for this automation,
 * or null when the chosen model is already strong, the work does not need
 * it, or no stronger profile exists. The cheapest frontier profile wins.
 */
export function recommendModelProfile({
  profiles,
  selected,
  active,
  prompt,
}: {
  profiles: readonly ProfileInfo[];
  /** The profile picked for the automation; empty means the active one. */
  selected: string;
  active: string | null;
  prompt: string;
}): string | null {
  if (!DEEP_WORK.test(prompt)) return null;
  const chosenName = selected || active;
  const chosen = profiles.find((profile) => profile.name === chosenName);
  if (chosen && lookupModelCapabilities(chosen.model).tier === "frontier")
    return null;

  const frontier = profiles
    .filter(
      (profile) =>
        typeof profile.model === "string" &&
        lookupModelCapabilities(profile.model).tier === "frontier",
    )
    .sort(
      (a, b) =>
        (blendedCostPerMTok(a.model as string) ?? Infinity) -
        (blendedCostPerMTok(b.model as string) ?? Infinity),
    );
  return frontier[0]?.name ?? null;
}
