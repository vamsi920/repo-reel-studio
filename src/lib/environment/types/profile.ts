import type { Capability, EgressHost } from "./capability";
import type { ReadinessReport } from "./requirements";

/**
 * How this install is deployed. Drives which requirements apply: an
 * air-gapped install must not be told to reach `generativelanguage.googleapis.com`,
 * and a SaaS tenant must not be asked for a Fly secret it does not own.
 */
export type DeploymentMode = "saas" | "hybrid" | "self-hosted" | "air-gapped";

export type DataResidency = "us" | "eu" | "in" | "other";

export interface ProviderSelection {
  providerId: string;
  /** Distinguishes two GitHub orgs, or prod vs staging Pinecone. */
  instanceKey: string;
  /** Non-secret settings only. Credentials live in `connections`. */
  config: Record<string, string | number | boolean>;
  connectionId?: string;
}

export interface NetworkPosture {
  proxyUrl?: string;
  noProxy?: string[];
  /**
   * Storage object key for an uploaded CA bundle. Never the PEM itself -- a
   * certificate chain in a jsonb column is both large and awkward to rotate.
   */
  customCaBundleRef?: string;
  tlsInterception: "none" | "suspected" | "confirmed";
  /** Host -> internal mirror, e.g. `registry.npmjs.org` -> `nexus.corp/npm`. */
  mirrors: Record<string, string>;
  inbound: {
    /** null = not yet probed. */
    webhooksReachable: boolean | null;
    publicBaseUrl?: string;
    /** Set when inbound is blocked; switches triggers to polling. */
    pollingFallback: boolean;
  };
  /** Resolved union of platform + selected-provider egress, for export. */
  allowlist: EgressHost[];
}

export interface EnvironmentPolicy {
  dataResidency?: DataResidency;
  telemetry: boolean;
  /** False forbids any provider whose traffic leaves the customer's control. */
  allowExternalLlm: boolean;
  /** Empty means no restriction, matching the server-side trigger. */
  signupDomains: string[];
}

export interface EnvironmentProfile {
  schemaVersion: 1;
  orgId: string;
  mode: DeploymentMode;
  providers: Partial<Record<Capability, ProviderSelection>>;
  network: NetworkPosture;
  policy: EnvironmentPolicy;
  runtime: {
    agentServerUrl?: string;
    automationUrl?: string;
    deepwikiUrl?: string;
    supabaseUrl?: string;
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    updatedBy: string;
    revision: number;
    notes?: string;
  };
}

/**
 * A portable description of an install. Carries no secrets -- only which
 * credential slots the target must fill -- so it can be emailed to a customer,
 * committed, or diffed.
 */
export interface EnvironmentBundle {
  bundleVersion: 1;
  profile: EnvironmentProfile;
  readiness: ReadinessReport;
  credentialSlots: {
    capability: Capability;
    providerId: string;
    instanceKey: string;
    fields: string[];
  }[];
  /** sha256 over the canonical JSON of `profile` + `credentialSlots`. */
  checksum: string;
}

export function createEmptyProfile(
  orgId: string,
  now: string,
): EnvironmentProfile {
  return {
    schemaVersion: 1,
    orgId,
    mode: "saas",
    providers: {},
    network: {
      tlsInterception: "none",
      mirrors: {},
      inbound: { webhooksReachable: null, pollingFallback: false },
      allowlist: [],
    },
    policy: { telemetry: true, allowExternalLlm: true, signupDomains: [] },
    runtime: {},
    meta: { createdAt: now, updatedAt: now, updatedBy: "", revision: 0 },
  };
}
