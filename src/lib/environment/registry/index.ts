import type {
  Capability,
  ConnectorManifest,
  EgressHost,
} from "../types/capability";
import type { DataResidency } from "../types/profile";
import { SOURCE_CONTROL_MANIFESTS } from "./source-control";
import { ISSUE_TRACKER_MANIFESTS } from "./issue-tracker";
import { VECTOR_STORE_MANIFESTS } from "./vector-store";
import { LLM_MANIFESTS } from "./llm";
import { PLATFORM_MANIFESTS } from "./platform";

/**
 * Every provider this app knows how to connect to.
 *
 * Adding a vendor is a manifest entry, a logo file and a set of translation
 * keys -- deliberately no new table, edge function or component. The edge
 * functions read a generated Deno mirror of this same data
 * (`supabase/functions/_shared/connector-registry/`), so the browser and the
 * server can never disagree about what a provider requires.
 */
export const CONNECTOR_MANIFESTS: ConnectorManifest[] = [
  ...SOURCE_CONTROL_MANIFESTS,
  ...ISSUE_TRACKER_MANIFESTS,
  ...LLM_MANIFESTS,
  ...VECTOR_STORE_MANIFESTS,
  ...PLATFORM_MANIFESTS,
];

const BY_ID = new Map(
  CONNECTOR_MANIFESTS.map((manifest) => [manifest.id, manifest]),
);

export function getConnectorManifest(
  id: string,
): ConnectorManifest | undefined {
  return BY_ID.get(id);
}

export function getConnectorsForCapability(
  capability: Capability,
): ConnectorManifest[] {
  return CONNECTOR_MANIFESTS.filter(
    (manifest) => manifest.capability === capability,
  );
}

/**
 * The provider each capability falls back to when the environment profile has
 * not chosen one. Keeping today's behaviour as the default is what makes the
 * adapter refactor safe: an install that never opens this module keeps
 * working exactly as before.
 */
export const DEFAULT_PROVIDER_BY_CAPABILITY: Partial<
  Record<Capability, string>
> = {
  "source-control": "github",
  "issue-tracker": "jira-cloud",
  llm: "google-gemini",
  "vector-store": "supabase-pgvector",
  "object-storage": "supabase-storage",
  "relational-db": "supabase-postgres",
  observability: "posthog",
};

/**
 * Filters the catalog by a residency requirement. A provider that cannot
 * serve the required region is excluded outright rather than flagged: an EU
 * customer cannot legally choose a US-only vendor, so offering it and warning
 * afterwards just wastes their time.
 */
export function filterByResidency(
  manifests: ConnectorManifest[],
  residency: DataResidency | undefined,
): ConnectorManifest[] {
  if (!residency || residency === "other") return manifests;
  return manifests.filter((manifest) => {
    const regions = manifest.residency ?? ["global"];
    return regions.includes("global") || regions.includes(residency);
  });
}

/**
 * Excludes providers that require egress an air-gapped install cannot have.
 * A manifest whose every egress host is mirrorable (or which has none at all,
 * meaning it is reached at a customer-supplied address) survives.
 */
export function filterForAirGap(
  manifests: ConnectorManifest[],
): ConnectorManifest[] {
  return manifests.filter((manifest) =>
    manifest.egress.every((host) => host.mirrorable),
  );
}

/** Deduplicated egress union for a set of selected providers. */
export function resolveEgressUnion(
  providerIds: string[],
  platformEgress: EgressHost[],
): EgressHost[] {
  const seen = new Map<string, EgressHost>();
  const add = (entry: EgressHost) => {
    const key = `${entry.host}:${entry.port}`;
    if (!seen.has(key)) seen.set(key, entry);
  };
  platformEgress.forEach(add);
  providerIds.forEach((id) => getConnectorManifest(id)?.egress.forEach(add));
  return [...seen.values()].sort((a, b) => a.host.localeCompare(b.host));
}

/** Field names whose values are encrypted and never returned to a caller. */
export function secretFieldNames(manifest: ConnectorManifest): string[] {
  return manifest.fields
    .filter((field) => field.secret)
    .map((field) => field.name);
}

/** Field names safe to store in plaintext `config` and to show the agent. */
export function configFieldNames(manifest: ConnectorManifest): string[] {
  return manifest.fields
    .filter((field) => !field.secret)
    .map((field) => field.name);
}

export {
  SOURCE_CONTROL_MANIFESTS,
  ISSUE_TRACKER_MANIFESTS,
  VECTOR_STORE_MANIFESTS,
  LLM_MANIFESTS,
  PLATFORM_MANIFESTS,
};
