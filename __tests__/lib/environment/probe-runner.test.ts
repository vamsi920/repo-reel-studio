import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the scope-shortage misdiagnosis reported against
 * /environment/connections: a probe that comes back with a genuinely
 * rejected credential (401, no scopes header at all) must not be reported as
 * "fewer permissions than requested", since no scopes were ever actually
 * compared -- the header simply never arrived.
 *
 * supabase/functions is excluded from this project's tsconfig (it's a
 * separate Deno program that imports its own files with explicit `.ts`
 * extensions, which `tsc` here rejects without `allowImportingTsExtensions`),
 * so the module is loaded with a dynamic, non-literal specifier -- a static
 * `import` would pull it (and its own `.ts`-suffixed imports) into this
 * project's type-checked program and break `npm run typecheck`.
 */
const PROBE_RUNNER_PATH = ["..", "..", "..", "supabase", "functions", "_shared", "probe-runner.ts"].join("/");
const { runConnectorProbe } = await import(/* @vite-ignore */ PROBE_RUNNER_PATH);

function githubLikeManifest() {
  return {
    id: "github",
    capability: "source-control",
    nameKey: "CONNECTOR$GITHUB_NAME",
    descriptionKey: "CONNECTOR$GITHUB_DESC",
    authKind: "oauth2-pkce",
    baseUrl: "https://api.github.com",
    fields: [],
    oauth: { scopes: ["repo", "read:user"] },
    probe: {
      vantage: ["edge"],
      request: { method: "GET", pathTemplate: "/user" },
      checks: [
        { id: "auth", labelKey: "PROBE$CHECK_AUTH", kind: "status-in", statuses: [200] },
        { id: "identity", labelKey: "PROBE$CHECK_IDENTITY", kind: "json-pointer-present", pointer: "/login" },
      ],
      scopeSource: { from: "header", name: "x-oauth-scopes", separator: "," },
    },
    egress: [],
    docsUrl: "https://docs.github.com/en/apps/oauth-apps",
    logo: "github.svg",
    maturity: "ga",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runConnectorProbe scope handling", () => {
  it("does not report missing scopes for a rejected credential with no scopes header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await runConnectorProbe(githubLikeManifest(), {}, { accessToken: "dead" });

    expect(result.grantedScopes).toBeUndefined();
    expect(result.missingScopes).toBeUndefined();
    expect(result.remediation?.codeKey).toBe("PROBE$REMEDIATION_UNAUTHORIZED");
  });

  it("still reports missing scopes when the vendor genuinely returns a granted-scopes header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ login: "octocat" }), {
          status: 200,
          headers: { "content-type": "application/json", "x-oauth-scopes": "read:user" },
        }),
      ),
    );

    const result = await runConnectorProbe(githubLikeManifest(), {}, { accessToken: "live" });

    expect(result.grantedScopes).toEqual(["read:user"]);
    expect(result.missingScopes).toEqual(["repo"]);
    expect(result.remediation?.codeKey).toBe("PROBE$REMEDIATION_FORBIDDEN");
  });
});
