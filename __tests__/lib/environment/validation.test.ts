import { describe, expect, it } from "vitest";
import {
  buildRedactedSummary,
  isBlockedHost,
  redactValue,
  validateConnectorValues,
} from "#/lib/environment/validation";
import { getConnectorManifest } from "#/lib/environment/registry";

const pinecone = getConnectorManifest("pinecone")!;
const gitlab = getConnectorManifest("gitlab-self-managed")!;
const ollama = getConnectorManifest("ollama")!;

describe("connector validation", () => {
  it("requires the fields a manifest marks required", () => {
    const errors = validateConnectorValues(pinecone, {});
    expect(errors.apiKey).toEqual({ code: "required" });
    expect(errors.indexHost).toEqual({ code: "required" });
    // Namespace is optional and must not be flagged.
    expect(errors.namespace).toBeUndefined();
  });

  it("rejects a host that is really a URL", () => {
    const errors = validateConnectorValues(gitlab, {
      instanceHost: "not a host at all",
      accessToken: "token",
    });
    expect(errors.instanceHost).toEqual({ code: "notAHost" });
  });

  it("enforces a declared value pattern", () => {
    const linear = getConnectorManifest("linear")!;
    const errors = validateConnectorValues(linear, { apiKey: "nope" });
    expect(errors.apiKey?.code).toBe("pattern");
  });
});

describe("host blocking", () => {
  /**
   * Host overrides exist so a customer can point a connector at their own
   * infrastructure. The same field, unchecked, aims the server-side proxy at
   * the cloud metadata endpoint.
   */
  it.each([
    "169.254.169.254",
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "172.16.0.1",
    "metadata.google.internal",
    "gitlab.internal",
  ])("blocks %s", (host) => {
    expect(isBlockedHost(host, "gitlab-self-managed")).toBe(true);
  });

  it("allows a real external host", () => {
    expect(isBlockedHost("gitlab.example.com", "gitlab-self-managed")).toBe(
      false,
    );
  });

  it("allows loopback for providers meant to run beside the workload", () => {
    // Ollama on the agent host is the entire point of that connector.
    expect(isBlockedHost("localhost:11434", "ollama")).toBe(false);
  });

  it("blocks a metadata address supplied through a validated field", () => {
    const errors = validateConnectorValues(gitlab, {
      instanceHost: "169.254.169.254",
      accessToken: "token",
    });
    expect(errors.instanceHost).toEqual({ code: "blockedHost" });
  });

  it("still allows an ollama host field through validation", () => {
    const errors = validateConnectorValues(ollama, {
      instanceHost: "localhost:11434",
      model: "llama3",
    });
    expect(errors.instanceHost).toBeUndefined();
  });
});

describe("redaction", () => {
  it("masks completely by default, so a forgotten rule fails closed", () => {
    expect(redactValue("super-secret-signing-key", undefined)).not.toContain(
      "secret",
    );
  });

  it("keeps only the last four characters for last4", () => {
    expect(redactValue("sk-abcdefgh1234", "last4")).toBe("••••1234");
  });

  it("never returns any part of a short secret", () => {
    expect(redactValue("ab", "last4")).toBe("••");
  });

  it("summarises a form without leaking the secret values", () => {
    const summary = buildRedactedSummary(pinecone, {
      apiKey: "pcsk-live-abcdefgh",
      indexHost: "my-index.svc.pinecone.io",
      namespace: "prod",
    });
    expect(summary.indexHost).toBe("my-index.svc.pinecone.io");
    expect(summary.namespace).toBe("prod");
    expect(summary.apiKey).not.toContain("pcsk");
    expect(JSON.stringify(summary)).not.toContain("abcdefgh");
  });
});
