/**
 * The one place that decides which manifests this host is offered.
 *
 * Setup manifests reach the host from two sources. `@openhands/extensions`
 * publishes the upstream catalog, and `local-automation-catalog.ts` holds the
 * entries this fork owns. They are merged here, by id, with the local entry
 * winning: several published entries ship no `setup` block at all, so selecting
 * one only opens a chat and nothing is ever created. Replacing those ids with a
 * local `direct` entry is what makes the card create a real automation.
 *
 * The catalog is passed as `unknown[]` on purpose: admission is a trust
 * boundary, so the host validates the published data rather than trusting the
 * types that shipped beside it. Local entries go through exactly the same
 * validation — being first-party is not a reason to skip the gate.
 */

import * as automationsModule from "@openhands/extensions/automations";
import {
  AUTOMATION_CATALOG,
  type RecommendedAutomation,
} from "@openhands/extensions/automations";
import {
  LOCAL_AUTOMATION_CATALOG,
  SUPERSEDES_PUBLISHED_ID,
} from "./local-automation-catalog";
import { createSetupRegistry, type SetupRegistry } from "./manifest-registry";

/**
 * Every entry this host knows about, published and local alike.
 *
 * The setup registry is built from this, not from the display catalog: the
 * package pins contract fixtures against ids it publishes, so resolving one
 * must keep working even when a local entry has taken its place on the page.
 */
const ALL_KNOWN_ENTRIES: readonly RecommendedAutomation[] = [
  ...AUTOMATION_CATALOG,
  ...LOCAL_AUTOMATION_CATALOG,
];

export const SETUP_REGISTRY: SetupRegistry = createSetupRegistry(
  ALL_KNOWN_ENTRIES as readonly unknown[],
);

/** Ids of everything known, so interface admission can validate against them. */
export const ALL_KNOWN_AUTOMATION_IDS: ReadonlySet<string> = new Set(
  ALL_KNOWN_ENTRIES.map((entry) => entry.id),
);

/**
 * The catalog the cards render from.
 *
 * A published entry that a local one replaces is dropped here so the user is
 * never offered both the chat-only original and its working replacement. The
 * replacement takes the original's position rather than being appended, so the
 * list keeps its familiar ordering.
 */
export const AUTOMATION_CATALOG_ALL: readonly RecommendedAutomation[] = (() => {
  const replacementFor = new Map<string, RecommendedAutomation>();
  LOCAL_AUTOMATION_CATALOG.forEach((entry) => {
    const publishedId = SUPERSEDES_PUBLISHED_ID[entry.id];
    if (publishedId) replacementFor.set(publishedId, entry);
  });

  const placed = new Set<string>();
  const displayed = AUTOMATION_CATALOG.flatMap((entry) => {
    const replacement = replacementFor.get(entry.id);
    if (!replacement) return [entry];
    placed.add(replacement.id);
    return [replacement];
  });

  return [
    ...displayed,
    ...LOCAL_AUTOMATION_CATALOG.filter((entry) => !placed.has(entry.id)),
  ];
})();

/**
 * The interface manifest the pinned package publishes, if any. It is read off
 * the module namespace so a package that predates the export yields
 * `undefined` rather than a build error; admission in
 * `automation-interface.ts` decides what to do with it.
 */
const automationsExports: object = automationsModule;
export const AUTOMATION_INTERFACE_CANDIDATE: unknown =
  "AUTOMATION_INTERFACE" in automationsExports
    ? automationsExports.AUTOMATION_INTERFACE
    : undefined;
