import { describe, expect, it } from "vitest";

import { computeWorkspaceId, normalizeWorkspacePath } from "./workspace-id";

describe("normalizeWorkspacePath", () => {
  it("strips trailing separators", () => {
    expect(normalizeWorkspacePath("/w/a/")).toBe("/w/a");
    expect(normalizeWorkspacePath("/w/a//")).toBe("/w/a");
  });

  it("keeps POSIX paths case-sensitive", () => {
    expect(normalizeWorkspacePath("/w/A")).toBe("/w/A");
  });

  it("case-folds Windows paths only", () => {
    expect(normalizeWorkspacePath("C:\\Work\\Repo")).toBe("c:/work/repo");
  });
});

describe("computeWorkspaceId", () => {
  it("is deterministic", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).toBe(
      computeWorkspaceId("backend-1", "/w/a"),
    );
  });

  it("ignores trailing slashes", () => {
    expect(computeWorkspaceId("backend-1", "/w/a/")).toBe(
      computeWorkspaceId("backend-1", "/w/a"),
    );
  });

  it("separates the same path on different backends", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).not.toBe(
      computeWorkspaceId("backend-2", "/w/a"),
    );
  });

  it("separates different paths on the same backend", () => {
    expect(computeWorkspaceId("backend-1", "/w/a")).not.toBe(
      computeWorkspaceId("backend-1", "/w/b"),
    );
  });

  it("returns null rather than a shared bucket when either half is missing", () => {
    expect(computeWorkspaceId("", "/w/a")).toBeNull();
    expect(computeWorkspaceId("backend-1", "")).toBeNull();
    expect(computeWorkspaceId(null, undefined)).toBeNull();
    expect(computeWorkspaceId("backend-1", "   ")).toBeNull();
  });
});
