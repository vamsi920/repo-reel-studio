import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CONNECTOR_MANIFESTS } from "#/lib/environment/registry";

const MIRROR_PATH = resolve(
  process.cwd(),
  "supabase/functions/_shared/connector-registry/index.ts",
);

/**
 * The Edge Functions cannot import from `src/`, so they read a generated
 * mirror of the registry. A stale mirror is a real bug rather than an
 * inconvenience: the connection form would ask for one set of fields while the
 * probe and the proxy used another, and the mismatch would only surface as a
 * confusing failure at a customer site.
 *
 * The comparison is done by parsing the checked-in file rather than by
 * re-running the generator. Running it here would have the test *fix* the
 * problem it is meant to detect -- a stale mirror would be silently rewritten,
 * pass, and leave an unexplained diff in the working tree.
 */
function readMirroredManifests(): unknown[] {
  const source = readFileSync(MIRROR_PATH, "utf8");
  const marker = "export const CONNECTOR_MANIFESTS: ConnectorManifest[] = ";
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThan(-1);

  // Search past the marker: `ConnectorManifest[]` in the declaration itself
  // contains a bracket, and matching that one yields "[]" instead of the array.
  const arrayStart = source.indexOf("[", start + marker.length);
  const arrayEnd = source.indexOf("\n];", arrayStart);
  expect(arrayEnd).toBeGreaterThan(arrayStart);

  return JSON.parse(source.slice(arrayStart, arrayEnd + 2)) as unknown[];
}

describe("connector registry mirror", () => {
  it("matches the source registry exactly", () => {
    const mirrored = readMirroredManifests();
    // The generator sorts by id; sort the source the same way so the
    // comparison is about content, not authoring order.
    const expected = [...CONNECTOR_MANIFESTS].sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(mirrored).toEqual(JSON.parse(JSON.stringify(expected)));
  });

  it("covers every provider", () => {
    const ids = readMirroredManifests().map(
      (manifest) => (manifest as { id: string }).id,
    );
    expect(new Set(ids)).toEqual(
      new Set(CONNECTOR_MANIFESTS.map((manifest) => manifest.id)),
    );
  });
});
