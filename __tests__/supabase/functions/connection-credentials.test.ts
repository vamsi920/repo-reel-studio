import { describe, expect, it } from "vitest";

/**
 * Regression coverage for the credential-rotation data-loss bug:
 * `credential-request-sheet.tsx`'s secret-rotation form only submits the
 * field(s) the agent asked to rotate on an already-connected provider, so
 * `connections-set-credentials` used to encrypt and store exactly that
 * partial set -- silently dropping every other secret already on the
 * connection (e.g. AWS Bedrock's optional `sessionToken`, Datadog's optional
 * `appKey`) the next time any single secret field was rotated.
 *
 * supabase/functions is excluded from this project's tsconfig, so the module
 * is loaded with a dynamic, non-literal specifier -- see
 * __tests__/lib/environment/probe-runner.test.ts for why.
 */
const CONNECTION_CREDENTIALS_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "connection-credentials.ts",
].join("/");
const { mergeConnectionCredentials } = await import(
  /* @vite-ignore */ CONNECTION_CREDENTIALS_PATH
);

describe("mergeConnectionCredentials", () => {
  it("keeps a previously stored secret that this rotation did not resubmit", () => {
    const merged = mergeConnectionCredentials(
      ["secretAccessKey", "sessionToken"],
      { secretAccessKey: "old-key", sessionToken: "old-session-token" },
      { secretAccessKey: "new-key" },
    );

    expect(merged).toEqual({
      secretAccessKey: "new-key",
      sessionToken: "old-session-token",
    });
  });

  it("lets a newly submitted value override the stored one for the same field", () => {
    const merged = mergeConnectionCredentials(
      ["apiKey", "appKey"],
      { apiKey: "old-api-key", appKey: "old-app-key" },
      { apiKey: "new-api-key", appKey: "new-app-key" },
    );

    expect(merged).toEqual({ apiKey: "new-api-key", appKey: "new-app-key" });
  });

  it("drops a stored field the manifest no longer declares as a secret", () => {
    const merged = mergeConnectionCredentials(
      ["apiKey"],
      { apiKey: "old-api-key", legacyToken: "stale-value" },
      {},
    );

    expect(merged).toEqual({ apiKey: "old-api-key" });
  });

  it("returns just the submitted value when nothing was previously stored", () => {
    const merged = mergeConnectionCredentials(["apiKey"], {}, { apiKey: "brand-new" });

    expect(merged).toEqual({ apiKey: "brand-new" });
  });

  it("accepts a Set for the allowed-field list, same as the edge function passes", () => {
    const merged = mergeConnectionCredentials(
      new Set(["apiKey", "appKey"]),
      { apiKey: "old-api-key", appKey: "old-app-key" },
      { apiKey: "new-api-key" },
    );

    expect(merged).toEqual({ apiKey: "new-api-key", appKey: "old-app-key" });
  });
});
