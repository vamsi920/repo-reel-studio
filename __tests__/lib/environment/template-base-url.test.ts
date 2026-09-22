import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the "zero-configuration" Supabase connectors
 * (Postgres, Storage, pgvector) that always failed instantly with
 * "Endpoint reachable: no_base_url": their manifests declare `authKind:
 * "none"` and `fields: []` because they reuse this deployment's own
 * Supabase project, but had no `baseUrl` for `resolveBaseUrl` to fall back
 * to, so the probe never even attempted a network call.
 *
 * supabase/functions is excluded from this project's tsconfig (see
 * probe-runner.test.ts for why), so the module is loaded the same way: a
 * dynamic, non-literal specifier.
 */
const TEMPLATE_PATH = ["..", "..", "..", "supabase", "functions", "_shared", "template.ts"].join("/");
const { resolveBaseUrl, assertHostAllowed, TemplateError } = await import(
  /* @vite-ignore */ TEMPLATE_PATH
);

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    id: "supabase-storage",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveBaseUrl baseUrlEnv", () => {
  it("still resolves a literal baseUrl when present (no regression)", () => {
    const base = resolveBaseUrl(manifest({ baseUrl: "https://api.github.com" }), {
      config: {},
      credentials: {},
      params: {},
    });
    expect(base).toBe("https://api.github.com");
  });

  it("throws no_base_url when neither baseUrl nor baseUrlEnv is set", () => {
    expect(() =>
      resolveBaseUrl(manifest(), { config: {}, credentials: {}, params: {} }),
    ).toThrow(TemplateError);
  });

  it("reads the base URL from the named environment variable via the Deno.env shim", () => {
    vi.stubGlobal("Deno", {
      env: { get: (name: string) => (name === "SUPABASE_URL" ? "https://proj.supabase.co" : undefined) },
    });

    const base = resolveBaseUrl(
      manifest({ baseUrlEnv: "SUPABASE_URL" }),
      { config: {}, credentials: {}, params: {} },
    );

    expect(base).toBe("https://proj.supabase.co");
  });

  it("falls back to process.env when no Deno global is present (this Vitest runtime)", () => {
    process.env.SUPABASE_URL_TEST_FIXTURE = "https://fixture.supabase.co";
    try {
      const base = resolveBaseUrl(
        manifest({ baseUrlEnv: "SUPABASE_URL_TEST_FIXTURE" }),
        { config: {}, credentials: {}, params: {} },
      );
      expect(base).toBe("https://fixture.supabase.co");
    } finally {
      delete process.env.SUPABASE_URL_TEST_FIXTURE;
    }
  });

  it("throws no_base_url when baseUrlEnv names an unset variable", () => {
    expect(() =>
      resolveBaseUrl(
        manifest({ baseUrlEnv: "SUPABASE_URL_DEFINITELY_UNSET" }),
        { config: {}, credentials: {}, params: {} },
      ),
    ).toThrow(TemplateError);
  });

  it("still lets a real hostOverride take priority over baseUrlEnv", () => {
    const base = resolveBaseUrl(
      manifest({
        id: "postgres",
        baseUrlEnv: "SUPABASE_URL",
        hostOverride: { field: "host", baseUrlTemplate: "postgres://{{host}}" },
      }),
      { config: { host: "db.example.com" }, credentials: {}, params: {} },
    );
    expect(base).toBe("postgres://db.example.com");
  });

  it("allows a loopback SUPABASE_URL for the three self-hosted Supabase connectors", () => {
    vi.stubGlobal("Deno", {
      env: { get: () => "http://127.0.0.1:54321" },
    });

    for (const id of ["supabase-storage", "supabase-postgres", "supabase-pgvector"]) {
      const base = resolveBaseUrl(
        manifest({ id, baseUrlEnv: "SUPABASE_URL" }),
        { config: {}, credentials: {}, params: {} },
      );
      expect(base).toBe("http://127.0.0.1:54321");
    }
  });
});

describe("assertHostAllowed IPv6 bypasses", () => {
  it("still blocks plain dotted-decimal loopback and link-local (no regression)", () => {
    expect(() => assertHostAllowed("http://127.0.0.1/", "github")).toThrow(TemplateError);
    expect(() => assertHostAllowed("http://169.254.169.254/", "github")).toThrow(TemplateError);
  });

  it("blocks an IPv4-mapped IPv6 loopback/metadata address", () => {
    expect(() => assertHostAllowed("http://[::ffff:127.0.0.1]/", "github")).toThrow(TemplateError);
    expect(() => assertHostAllowed("http://[::ffff:169.254.169.254]/", "github")).toThrow(
      TemplateError,
    );
  });

  it("blocks IPv6 loopback, unspecified, link-local and unique-local addresses", () => {
    for (const host of ["http://[::1]/", "http://[::]/", "http://[fe80::1]/", "http://[fc00::1]/"]) {
      expect(() => assertHostAllowed(host, "github")).toThrow(TemplateError);
    }
  });

  it("still allows a normal public IPv6 host", () => {
    expect(() => assertHostAllowed("http://[2606:4700:4700::1111]/", "github")).not.toThrow();
  });

  it("still allows an ordinary public hostname", () => {
    expect(() => assertHostAllowed("https://github.example.com/", "github")).not.toThrow();
  });
});
