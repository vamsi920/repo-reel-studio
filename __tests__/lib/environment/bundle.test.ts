import { describe, expect, it } from "vitest";
import {
  buildEnvironmentBundle,
  verifyBundleChecksum,
} from "#/lib/environment/bundle";
import { createEmptyProfile } from "#/lib/environment/types/profile";
import type { ReadinessReport } from "#/lib/environment/types/requirements";

const NOW = "2026-08-30T00:00:00.000Z";

const readiness: ReadinessReport = {
  score: 80,
  blocking: [],
  degrading: [],
  unknown: [],
  byCapability: {},
  generatedAt: NOW,
};

const connections = [
  {
    capability: "vector-store" as const,
    providerId: "pinecone",
    instanceKey: "default",
  },
  { capability: "llm" as const, providerId: "ollama", instanceKey: "default" },
];

describe("environment bundle", () => {
  it("names the credential slots the target install must fill", async () => {
    const bundle = await buildEnvironmentBundle(
      createEmptyProfile("org", NOW),
      readiness,
      connections,
    );
    const pinecone = bundle.credentialSlots.find(
      (slot) => slot.providerId === "pinecone",
    );
    expect(pinecone?.fields).toEqual(["apiKey"]);
    // Ollama needs no credential, so it contributes no slot rather than an
    // empty one.
    expect(
      bundle.credentialSlots.some((slot) => slot.providerId === "ollama"),
    ).toBe(false);
  });

  it("carries no credential material at all", async () => {
    const profile = createEmptyProfile("org", NOW);
    profile.providers["vector-store"] = {
      providerId: "pinecone",
      instanceKey: "default",
      config: { indexHost: "my-index.svc.pinecone.io" },
    };
    const bundle = await buildEnvironmentBundle(
      profile,
      readiness,
      connections,
    );
    const serialised = JSON.stringify(bundle);
    expect(serialised).not.toMatch(
      /encryptedCredentials|apiKeyValue|"secret"/i,
    );
    // Field NAMES are expected and are what makes the bundle useful.
    expect(serialised).toContain("apiKey");
  });

  it("produces a stable checksum regardless of key order", async () => {
    const a = createEmptyProfile("org", NOW);
    const b = createEmptyProfile("org", NOW);
    // Same content, different insertion order.
    a.policy = {
      telemetry: true,
      allowExternalLlm: false,
      signupDomains: ["x.com"],
    };
    b.policy = {
      signupDomains: ["x.com"],
      allowExternalLlm: false,
      telemetry: true,
    };

    const first = await buildEnvironmentBundle(a, readiness, connections);
    const second = await buildEnvironmentBundle(b, readiness, connections);
    expect(first.checksum).toBe(second.checksum);
    expect(await verifyBundleChecksum(first)).toBe(true);
  });

  it("detects a tampered bundle", async () => {
    const bundle = await buildEnvironmentBundle(
      createEmptyProfile("org", NOW),
      readiness,
      connections,
    );
    bundle.profile.mode = "air-gapped";
    expect(await verifyBundleChecksum(bundle)).toBe(false);
  });
});
