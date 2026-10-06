import { describe, expect, it } from "vitest";

/**
 * supabase/functions is excluded from this project's tsconfig (see
 * legacy-mirror.test.ts), so the module is loaded with a dynamic specifier.
 */
const MODULE_PATH = [
  "..",
  "..",
  "..",
  "supabase",
  "functions",
  "_shared",
  "connection-health.ts",
].join("/");
const {
  classifyRefreshFailure,
  classifyApiAuthFailure,
  statusFromProbe,
  isAllowedAppOrigin,
  resolveAppOrigin,
  safeReturnPath,
  parseAppOriginAllowlist,
} = await import(/* @vite-ignore */ MODULE_PATH);

const PROD = "https://neo.neodevex.com";

describe("classifyRefreshFailure", () => {
  it("expires the connection only on a definitive rejection", () => {
    expect(classifyRefreshFailure(400, { error: "invalid_grant" })).toBe(
      "expired",
    );
    expect(classifyRefreshFailure(401, null)).toBe("expired");
  });

  it("leaves the status alone for a provider outage or rate limit", () => {
    expect(classifyRefreshFailure(500, null)).toBeNull();
    expect(
      classifyRefreshFailure(503, { error: "temporarily_unavailable" }),
    ).toBeNull();
    expect(classifyRefreshFailure(429, null)).toBeNull();
  });
});

describe("classifyApiAuthFailure", () => {
  it("treats 401 as revoked without refresh and expired with it", () => {
    expect(classifyApiAuthFailure(401, false)).toBe("revoked");
    expect(classifyApiAuthFailure(401, true)).toBe("expired");
  });

  it("treats 403 as degraded and ignores non-auth failures", () => {
    expect(classifyApiAuthFailure(403, false)).toBe("degraded");
    expect(classifyApiAuthFailure(502, false)).toBeNull();
    expect(classifyApiAuthFailure(404, true)).toBeNull();
  });
});

describe("statusFromProbe", () => {
  it("maps probe outcomes to the same verdicts the proxies reach", () => {
    expect(statusFromProbe({ ok: true }, false)).toBe("ok");
    expect(statusFromProbe({ ok: true, missingScopes: ["repo"] }, false)).toBe(
      "degraded",
    );
    const unauthorized = {
      ok: false,
      remediation: { codeKey: "PROBE$REMEDIATION_UNAUTHORIZED" },
    };
    expect(statusFromProbe(unauthorized, false)).toBe("revoked");
    expect(statusFromProbe(unauthorized, true)).toBe("expired");
    expect(
      statusFromProbe(
        {
          ok: false,
          remediation: { codeKey: "PROBE$REMEDIATION_UNREACHABLE" },
        },
        false,
      ),
    ).toBe("error");
  });
});

describe("OAuth return origin", () => {
  const allowlist = parseAppOriginAllowlist(
    "https://*.preview.example.com",
    PROD,
  );

  it.each([
    ["http://localhost:3001", true],
    ["http://127.0.0.1:8000", true],
    ["http://[::1]:8000", true],
    ["http://app.localhost:3000", true],
    [PROD, true],
    ["https://pr-12.preview.example.com", true],
    ["https://a.b.preview.example.com", false],
    ["https://evil.example", false],
    ["http://neo.neodevex.com", false],
    ["https://neo.neodevex.com/path", false],
    ["https://user:pw@neo.neodevex.com", false],
    ["javascript:alert(1)", false],
    ["not a url", false],
  ])("origin %s allowed=%s", (origin, expected) => {
    expect(isAllowedAppOrigin(origin, allowlist)).toBe(expected);
  });

  it("falls back to the deployment origin when the stored one is not allowed", () => {
    expect(resolveAppOrigin("http://localhost:3001", allowlist, PROD)).toBe(
      "http://localhost:3001",
    );
    expect(resolveAppOrigin("https://evil.example", allowlist, PROD)).toBe(
      PROD,
    );
    expect(resolveAppOrigin(null, allowlist, PROD)).toBe(PROD);
  });

  it("refuses a return path that could leave the app", () => {
    expect(safeReturnPath("/canvas/environment/setup", "/x")).toBe(
      "/canvas/environment/setup",
    );
    expect(safeReturnPath("//evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("https://evil.example", "/x")).toBe("/x");
    expect(safeReturnPath("/\\evil", "/x")).toBe("/x");
    expect(safeReturnPath(null, "/x")).toBe("/x");
  });
});
