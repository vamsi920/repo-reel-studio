import type { Capability } from "./types/capability";
import type { EnvironmentBundle, EnvironmentProfile } from "./types/profile";
import type { ReadinessReport } from "./types/requirements";
import { getConnectorManifest, secretFieldNames } from "./registry";

export interface BundleConnectionRef {
  capability: Capability;
  providerId: string;
  instanceKey: string;
}

/**
 * Canonical JSON: keys sorted at every level, so the same profile always
 * hashes to the same checksum regardless of how the object was assembled.
 * Without this, exporting the same install twice produces two different
 * checksums and the integrity check becomes noise.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Builds the portable description of an install.
 *
 * `credentialSlots` lists which fields the target deployment will have to
 * supply -- names only. The bundle deliberately carries no credential
 * material at all, so it can be attached to a ticket, committed, or emailed
 * without anyone having to think about whether that was safe.
 */
export async function buildEnvironmentBundle(
  profile: EnvironmentProfile,
  readiness: ReadinessReport,
  connections: BundleConnectionRef[],
): Promise<EnvironmentBundle> {
  const credentialSlots = connections
    .map((connection) => {
      const manifest = getConnectorManifest(connection.providerId);
      if (!manifest) return null;
      const fields = secretFieldNames(manifest);
      if (fields.length === 0) return null;
      return { ...connection, fields };
    })
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null);

  const payload = canonicalize({ profile, credentialSlots });
  const checksum = await sha256Hex(JSON.stringify(payload));

  return {
    bundleVersion: 1,
    profile,
    readiness,
    credentialSlots,
    checksum,
  };
}

/** Recomputes the checksum and compares. Used on import, before anything is applied. */
export async function verifyBundleChecksum(
  bundle: EnvironmentBundle,
): Promise<boolean> {
  const payload = canonicalize({
    profile: bundle.profile,
    credentialSlots: bundle.credentialSlots,
  });
  return (await sha256Hex(JSON.stringify(payload))) === bundle.checksum;
}
