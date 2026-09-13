import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the Runbook "Generate packet" bug: the Firewall
 * rules table rendered raw i18n key literals (e.g. "PROBE$EGRESS_GITHUB_API")
 * instead of human-readable text whenever a host came from a connector
 * manifest, because connector-registry's `purposeKey` is an untranslated
 * i18n key and this Deno edge function has no i18n runtime. It also let a
 * connector's raw-key entry silently clobber a platform baseline entry for
 * the identical host (e.g. github.com).
 *
 * supabase/functions is excluded from this project's tsconfig (see
 * __tests__/lib/environment/probe-runner.test.ts for why), so the module is
 * loaded with a dynamic, non-literal specifier. This imports the pure
 * _shared/environment-packet.ts module rather than environment-profile's own
 * index.ts, which calls Deno.serve() at module scope and would throw when
 * imported outside a Deno runtime.
 */
const ENVIRONMENT_PACKET_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "environment-packet.ts",
].join("/");
const { resolveEgressPurpose, renderPacket, mergeEgressHosts } = await import(
  /* @vite-ignore */ ENVIRONMENT_PACKET_PATH
);

describe("resolveEgressPurpose", () => {
  it("resolves a known connector PROBE$ key to readable English text", () => {
    expect(resolveEgressPurpose("PROBE$EGRESS_ATLASSIAN_API")).toBe("Jira REST API");
    expect(resolveEgressPurpose("PROBE$EGRESS_GITHUB_API")).toBe("GitHub REST API");
  });

  it("passes platform literal text through unchanged", () => {
    expect(resolveEgressPurpose("npm registry")).toBe("npm registry");
  });

  it("falls back to the raw key when truly unmapped", () => {
    expect(resolveEgressPurpose("PROBE$EGRESS_SOME_FUTURE_PROVIDER")).toBe(
      "PROBE$EGRESS_SOME_FUTURE_PROVIDER",
    );
  });
});

describe("mergeEgressHosts", () => {
  it("keeps the platform's readable entry when a connector duplicates the same host", () => {
    const merged = mergeEgressHosts(
      [{ id: "github" }],
      [{ host: "github.com", port: 443, purposeKey: "GitHub OAuth", mirrorable: false }],
    );
    const githubCom = merged.find((h: { host: string }) => h.host === "github.com");
    expect(githubCom?.purposeKey).toBe("GitHub OAuth");
  });
});

describe("renderPacket firewall table", () => {
  it("never renders a raw PROBE$ key literal in the markdown table", () => {
    const markdown = renderPacket("https://neo.neodevex.com", "https://proj.supabase.co", [], [
      { host: "auth.atlassian.com", port: 443, purposeKey: "PROBE$EGRESS_ATLASSIAN_AUTH", mirrorable: false },
      { host: "api.atlassian.com", port: 443, purposeKey: "PROBE$EGRESS_ATLASSIAN_API", mirrorable: false },
      { host: "api.github.com", port: 443, purposeKey: "GitHub REST API", mirrorable: false },
    ]);

    expect(markdown).not.toContain("PROBE$");
    expect(markdown).toContain("Atlassian OAuth and token refresh");
    expect(markdown).toContain("Jira REST API");
  });
});
