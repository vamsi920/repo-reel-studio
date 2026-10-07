import { describe, expect, it } from "vitest";
import {
  expiresSoon,
  needsReconnect,
  oauthConfigFor,
} from "#/lib/environment/connection-health";
import { resolveOAuthReturnPath } from "#/lib/environment/oauth-origin";

describe("needsReconnect", () => {
  it.each([
    ["expired", null, true],
    ["revoked", null, true],
    ["ok", null, false],
    ["degraded", null, false],
    ["unverified", null, false],
  ])("status %s => %s", (status, lastProbe, expected) => {
    expect(
      needsReconnect({ status, lastProbe } as Parameters<
        typeof needsReconnect
      >[0]),
    ).toBe(expected);
  });

  it("counts an error as reconnectable only when the credential itself was rejected", () => {
    const rejected = {
      status: "error",
      lastProbe: { remediation: { codeKey: "PROBE$REMEDIATION_UNAUTHORIZED" } },
    };
    const unreachable = {
      status: "error",
      lastProbe: { remediation: { codeKey: "PROBE$REMEDIATION_UNREACHABLE" } },
    };
    expect(needsReconnect(rejected as never)).toBe(true);
    expect(needsReconnect(unreachable as never)).toBe(false);
    expect(needsReconnect(undefined)).toBe(false);
  });
});

describe("oauthConfigFor", () => {
  it("passes through string config (host, tenant) and drops non-strings", () => {
    expect(
      oauthConfigFor({
        config: { enterpriseHost: "ghe.example.com", n: 3, ok: true },
      }),
    ).toEqual({ enterpriseHost: "ghe.example.com" });
  });
});

describe("resolveOAuthReturnPath", () => {
  it("keeps a path inside the app and falls back for anything else", () => {
    expect(resolveOAuthReturnPath("/environment/setup")).toBe(
      "/environment/setup",
    );
    expect(resolveOAuthReturnPath(undefined)).toBe("/environment/connections");
    expect(resolveOAuthReturnPath("https://evil.example")).toBe(
      "/environment/connections",
    );
  });
});

describe("expiresSoon", () => {
  const NOW = Date.parse("2026-10-07T00:00:00.000Z");
  const DAY = 24 * 60 * 60_000;
  const healthy = (expiresAt: string | null) =>
    ({ status: "ok", lastProbe: null, expiresAt }) as Parameters<
      typeof expiresSoon
    >[0];

  it("warns for a non-renewable token lapsing within three days", () => {
    const at = new Date(NOW + 2 * DAY).toISOString();
    expect(
      expiresSoon(healthy(at), { oauth: undefined }, NOW)?.toISOString(),
    ).toBe(at);
  });

  it("stays quiet for renewable tokens, distant expiry, no expiry, or an already-broken connection", () => {
    const soon = new Date(NOW + DAY).toISOString();
    const renewable = { oauth: { refreshable: true } } as never;
    expect(expiresSoon(healthy(soon), renewable, NOW)).toBeNull();
    expect(
      expiresSoon(
        healthy(new Date(NOW + 10 * DAY).toISOString()),
        undefined,
        NOW,
      ),
    ).toBeNull();
    expect(expiresSoon(healthy(null), undefined, NOW)).toBeNull();
    expect(
      expiresSoon(
        { ...healthy(soon), status: "revoked" } as never,
        undefined,
        NOW,
      ),
    ).toBeNull();
  });
});
