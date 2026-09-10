import { describe, expect, it, vi } from "vitest";

import {
  applyCorsHeaders,
  DEFAULT_ALLOWED_ORIGINS,
  parseAllowedOrigins,
  resolveCorsOrigin,
} from "../../scripts/agentops/cors.mjs";

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    headers,
  };
}

describe("parseAllowedOrigins", () => {
  it("falls back to the default list when unset", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
    expect(parseAllowedOrigins("")).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it("splits a comma-separated env value and trims whitespace", () => {
    expect(
      parseAllowedOrigins("https://a.example.com, https://b.example.com"),
    ).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("ignores empty entries and falls back if nothing usable remains", () => {
    expect(parseAllowedOrigins(" , ,")).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });
});

describe("resolveCorsOrigin", () => {
  const allowed = ["https://neo.neodevex.com"];

  it("returns the origin when it's in the allow-list", () => {
    expect(resolveCorsOrigin("https://neo.neodevex.com", allowed)).toBe(
      "https://neo.neodevex.com",
    );
  });

  it("returns null for an origin not in the allow-list", () => {
    expect(resolveCorsOrigin("https://evil.example.com", allowed)).toBeNull();
  });

  it("returns null when there is no origin header (same-origin/non-browser request)", () => {
    expect(resolveCorsOrigin(undefined, allowed)).toBeNull();
  });

  it("echoes any origin back when the allow-list is a wildcard", () => {
    expect(resolveCorsOrigin("https://anything.example.com", ["*"])).toBe("*");
  });
});

describe("applyCorsHeaders", () => {
  const allowed = ["https://neo.neodevex.com"];

  it("sets Allow-Origin and Vary for an allowed origin, plus the shared headers", () => {
    const res = fakeRes();
    applyCorsHeaders(res, "https://neo.neodevex.com", allowed);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe(
      "https://neo.neodevex.com",
    );
    expect(res.headers.Vary).toBe("Origin");
    expect(res.headers["Access-Control-Allow-Headers"]).toContain(
      "X-Session-API-Key",
    );
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });

  it("omits Allow-Origin/Vary for a disallowed origin but still sets the shared headers", () => {
    const res = fakeRes();
    applyCorsHeaders(res, "https://evil.example.com", allowed);
    expect(res.headers["Access-Control-Allow-Origin"]).toBeUndefined();
    expect(res.headers.Vary).toBeUndefined();
    expect(res.headers["Access-Control-Allow-Methods"]).toContain("GET");
  });
});
