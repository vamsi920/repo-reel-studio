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

  it("allows the jsdelivr CDN to load the Monaco editor used by the Diff tab", () => {
    // @monaco-editor/react's default loader (src/components/features/
    // diff-viewer/file-diff-viewer.tsx) fetches its AMD loader script and
    // worker bundles from cdn.jsdelivr.net; without this, script-src blocks
    // the loader and the Diff tab spins on "Loading..." forever.
    expect(getDirectiveSources("script-src")).toContain(
      "https://cdn.jsdelivr.net",
    );
  });

  it("still restricts script-src to self, inline, and the two allowed CDNs", () => {
    expect(getDirectiveSources("script-src").sort()).toEqual(
      [
        "'self'",
        "'unsafe-inline'",
        "https://z.openhands.dev",
        "https://cdn.jsdelivr.net",
      ].sort(),
    );
  });

  it("allows the jsdelivr CDN to load Monaco's web workers", () => {
    expect(getDirectiveSources("worker-src")).toContain(
      "https://cdn.jsdelivr.net",
    );
  });

  it("still restricts worker-src to self, blob, and the jsdelivr CDN", () => {
    expect(getDirectiveSources("worker-src").sort()).toEqual(
      ["'self'", "blob:", "https://cdn.jsdelivr.net"].sort(),
    );
  });

  it("allows framing the agent-server workspace host for the Files tab's Rich preview", () => {
    // src/components/features/files-tab/file-content-viewer.tsx iframes HTML
    // and PDF files from the conversation's agent-server workspace URL
    // (src/hooks/query/use-workspace-file-content.ts). That host is
    // user-configurable per backend (src/api/backend-registry/types.ts), so
    // it can't be pinned to one domain here; without a frame-src, the
    // default-src 'self' fallback silently blocks the iframe and the Rich
    // preview pane stays permanently blank.
    expect(getDirectiveSources("frame-src")).toContain("https:");
  });

  it("still restricts frame-src to self and https", () => {
    expect(getDirectiveSources("frame-src").sort()).toEqual(
      ["'self'", "https:"].sort(),
    );
  });
});
