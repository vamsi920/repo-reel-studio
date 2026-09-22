import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the GitHub Enterprise OAuth secret-exfiltration bug:
 * `enterpriseHost` is free text a user types into the Connections settings
 * form, and `github-oauth-callback` POSTs this deployment's
 * `GITHUB_ENTERPRISE_OAUTH_CLIENT_SECRET` to `githubTokenUrl(enterpriseHost)`.
 * Without `assertEnterpriseHostAllowed`, naming an internal/cloud-metadata
 * host there made the server hand that shared secret straight back out.
 *
 * supabase/functions is excluded from this project's tsconfig (see
 * __tests__/lib/environment/probe-runner.test.ts for why), so the module is
 * loaded with a dynamic, non-literal specifier.
 */
const GITHUB_SHARED_PATH = ["..", "..", "..", "supabase", "functions", "_shared", "github.ts"].join(
  "/",
);
const { assertEnterpriseHostAllowed, githubAuthorizeUrl, githubTokenUrl, githubApiBaseUrl } =
  await import(/* @vite-ignore */ GITHUB_SHARED_PATH);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertEnterpriseHostAllowed", () => {
  it("allows a null host (github.com, no enterprise host configured)", () => {
    expect(() => assertEnterpriseHostAllowed(null)).not.toThrow();
  });

  it("allows an ordinary customer GHES hostname", () => {
    expect(() => assertEnterpriseHostAllowed("ghe.example.com")).not.toThrow();
  });

  it("rejects the cloud metadata address", () => {
    expect(() => assertEnterpriseHostAllowed("169.254.169.254")).toThrow();
  });

  it("rejects loopback and RFC1918 hosts", () => {
    for (const host of ["127.0.0.1", "localhost", "10.0.0.5", "192.168.1.1"]) {
      expect(() => assertEnterpriseHostAllowed(host)).toThrow();
    }
  });

  it("rejects an IPv4-mapped IPv6 metadata address (bracketed literal)", () => {
    expect(() => assertEnterpriseHostAllowed("[::ffff:169.254.169.254]")).toThrow();
  });
});

describe("GHES URL builders stay keyed off the same enterprise host", () => {
  it("fall back to github.com endpoints when no host is given", () => {
    expect(githubAuthorizeUrl(null)).toBe("https://github.com/login/oauth/authorize");
    expect(githubTokenUrl(null)).toBe("https://github.com/login/oauth/access_token");
    expect(githubApiBaseUrl(null)).toBe("https://api.github.com");
  });

  it("build endpoints against the given enterprise host", () => {
    expect(githubAuthorizeUrl("ghe.example.com")).toBe(
      "https://ghe.example.com/login/oauth/authorize",
    );
    expect(githubTokenUrl("ghe.example.com")).toBe(
      "https://ghe.example.com/login/oauth/access_token",
    );
    expect(githubApiBaseUrl("ghe.example.com")).toBe("https://ghe.example.com/api/v3");
  });
});
