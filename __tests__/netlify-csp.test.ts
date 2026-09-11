// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const netlifyToml = readFileSync(
  join(__dirname, "../netlify.toml"),
  "utf-8",
);

function getDirectiveSources(directive: string): string[] {
  const match = netlifyToml.match(
    new RegExp(`Content-Security-Policy = "([^"]*)"`),
  );
  if (!match) throw new Error("Content-Security-Policy header not found");
  const csp = match[1];
  const directiveMatch = csp.match(new RegExp(`${directive} ([^;]*)`));
  if (!directiveMatch) throw new Error(`${directive} not found in CSP`);
  return directiveMatch[1].trim().split(/\s+/);
}

describe("netlify.toml Content-Security-Policy", () => {
  it("allows PostHog's proxy host to load telemetry scripts", () => {
    // src/services/telemetry.ts routes PostHog through the z.openhands.dev
    // reverse proxy specifically to avoid ad blockers; without this in
    // script-src, the browser blocks web-vitals.js, the PostHog config
    // loader, dead-clicks-autocapture.js, and surveys.js on every page load.
    expect(getDirectiveSources("script-src")).toContain(
      "https://z.openhands.dev",
    );
  });

  it("still restricts script-src to self, inline, and the telemetry proxy", () => {
    expect(getDirectiveSources("script-src").sort()).toEqual(
      ["'self'", "'unsafe-inline'", "https://z.openhands.dev"].sort(),
    );
  });
});
