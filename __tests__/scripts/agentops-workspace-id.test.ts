import { describe, expect, it } from "vitest";

import {
  computeWorkspaceId,
  normalizeWorkspacePath,
  DEFAULT_BACKEND_ID,
} from "../../scripts/agentops/workspace-id.mjs";
import { computeWorkspaceId as computeWorkspaceIdTs } from "../../src/lib/workspace-memory/workspace-id";
import { SEEDED_DEFAULT_BACKEND_ID } from "../../src/api/backend-registry/default-backend";

/**
 * This collector-side port MUST produce byte-identical ids to the browser's
 * `src/lib/workspace-memory/workspace-id.ts` — they write into the same
 * `workspaces.id` column. Cross-checking against the real TS implementation,
 * not just internal self-consistency, is the point of this file.
 */
describe("computeWorkspaceId parity with the TypeScript original", () => {
  const cases: [string, string][] = [
    ["default-local", "/Users/vamsi/Desktop/neodevex/repo-reel-studio"],
    ["backend-1", "/w/a"],
    ["backend-1", "/w/a/"],
    ["backend-2", "/w/a"],
    ["default-local", "C:\\Work\\Repo"],
  ];

  it.each(cases)("matches for (%s, %s)", (backendId, path) => {
    expect(computeWorkspaceId(backendId, path)).toBe(
      computeWorkspaceIdTs(backendId, path),
    );
  });

  it("matches on null/undefined edge cases", () => {
    expect(computeWorkspaceId(null, "/w/a")).toBe(
      computeWorkspaceIdTs(null, "/w/a"),
    );
    expect(computeWorkspaceId("backend-1", "")).toBe(
      computeWorkspaceIdTs("backend-1", ""),
    );
    expect(computeWorkspaceId(undefined, undefined)).toBe(
      computeWorkspaceIdTs(undefined, undefined),
    );
  });
});

describe("computeWorkspaceId", () => {
  it("is deterministic and ignores trailing slashes", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).toBe(
      computeWorkspaceId("backend-1", "/w/a"),
    );
    expect(computeWorkspaceId("backend-1", "/w/a/")).toBe(
      computeWorkspaceId("backend-1", "/w/a"),
    );
  });

  it("separates the same path on different backends", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).not.toBe(
      computeWorkspaceId("backend-2", "/w/a"),
    );
  });

  it("returns null when either half is missing", () => {
    expect(computeWorkspaceId(null, "/w/a")).toBeNull();
    expect(computeWorkspaceId("backend-1", null)).toBeNull();
  });

  it("always starts with the ws_ prefix", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).toMatch(
      /^ws_[0-9a-f]{16}$/,
    );
  });
});

describe("normalizeWorkspacePath", () => {
  it("strips trailing separators and case-folds only Windows paths", () => {
    expect(normalizeWorkspacePath("/w/a/")).toBe("/w/a");
    expect(normalizeWorkspacePath("/w/A")).toBe("/w/A");
    expect(normalizeWorkspacePath("C:\\Work\\Repo")).toBe("c:/work/repo");
  });
});

describe("DEFAULT_BACKEND_ID", () => {
  it("matches the frontend's seeded default local backend id exactly", () => {
    expect(DEFAULT_BACKEND_ID).toBe(SEEDED_DEFAULT_BACKEND_ID);
  });
});
