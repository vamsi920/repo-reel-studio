/**
 * Workspace isolation is the one property that must never regress: memory from
 * one workspace reaching another is a data leak, not a bug in ranking. These
 * tests exercise the whole read path -- store, context service, rendered block
 * -- rather than any single function.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import {
  readRecords,
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";

import { makeRecord } from "./test-fixtures";
import { computeWorkspaceId } from "./workspace-id";
import WorkspaceContextService, {
  resetRecordSource,
  setRecordSource,
} from "./workspace-context-service";

const ID_A = computeWorkspaceId("backend-1", "/w/a")!;
const ID_B = computeWorkspaceId("backend-1", "/w/b")!;
const ID_A_OTHER_BACKEND = computeWorkspaceId("backend-2", "/w/a")!;

function seed(workspaceId: string, statement: string) {
  const record = makeRecord({
    subject: "payments:transport",
    statement,
  });
  writeRecords(workspaceId, [{ ...record, workspaceId }]);
}

function build(workspaceId: string) {
  return WorkspaceContextService.buildContext({
    workspaceId,
    task: "how does payments talk to the rest of the system",
    conversationId: "conv-1",
    tokenBudget: 2000,
  });
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  WorkspaceContextService.resetCache();
  resetRecordSource();
});

describe("workspace isolation", () => {
  it("does not leak records to a different workspace on the same backend", () => {
    seed(ID_A, "Payments moved to gRPC in workspace A.");

    expect(readRecords(ID_A)).toHaveLength(1);
    expect(readRecords(ID_B)).toEqual([]);

    expect(build(ID_A).text).toContain("workspace A");
    expect(build(ID_B).text).toBe("");
  });

  it("does not leak records across backends at the same path", () => {
    seed(ID_A, "Payments moved to gRPC in workspace A.");

    expect(readRecords(ID_A_OTHER_BACKEND)).toEqual([]);
    expect(build(ID_A_OTHER_BACKEND).text).toBe("");
  });

  it("refuses to store a record under a workspace it does not belong to", () => {
    const foreign = makeRecord({
      subject: "payments:transport",
      statement: "Payments moved to gRPC in workspace A.",
    });
    writeRecords(ID_B, [{ ...foreign, workspaceId: ID_A }]);

    expect(readRecords(ID_B)).toEqual([]);
  });

  it("drops a foreign record even if one reaches the record source", () => {
    const foreign = makeRecord({
      subject: "payments:transport",
      statement: "Payments moved to gRPC in workspace A.",
    });
    // Simulate a corrupted store handing back a record from elsewhere.
    setRecordSource(() => [{ ...foreign, workspaceId: ID_A }]);

    expect(build(ID_B).text).toBe("");
    resetRecordSource();
  });

  it("returns empty for a null-ish workspace instead of a shared bucket", () => {
    seed(ID_A, "Payments moved to gRPC in workspace A.");
    expect(build("").text).toBe("");
    expect(readRecords("")).toEqual([]);
  });
});

/**
 * Structural guard, in the spirit of `no-direct-agent-server-calls.test.ts`:
 * the storage API must never grow a "current workspace" convenience that
 * bypasses the isolation boundary.
 */
describe("storage API shape", () => {
  const source = readFileSync(
    join(
      process.cwd(),
      "src/api/workspace-memory/workspace-memory-store.api.ts",
    ),
    "utf-8",
  );

  const exportedFunctions = Array.from(
    source.matchAll(/export function (\w+)\(([^)]*)\)/g),
  ).map(([, name, params]) => ({ name, params: params.trim() }));

  it("exports functions that all take workspaceId first", () => {
    // `list*` is the one deliberate exception: it returns workspace ids only,
    // never record content, for the Usage dashboard's rollup and picker.
    const dataAccessors = exportedFunctions.filter(
      ({ name }) =>
        !name.startsWith("reset") &&
        !name.startsWith("prune") &&
        !name.startsWith("list"),
    );
    expect(dataAccessors.length).toBeGreaterThan(0);
    dataAccessors.forEach(({ name, params }) => {
      expect(
        params.startsWith("workspaceId"),
        `${name} must take workspaceId as its first parameter`,
      ).toBe(true);
    });
  });

  it("has no global or cross-workspace accessor", () => {
    expect(source).not.toMatch(/export function readAllRecords/);
    expect(source).not.toMatch(/export function getCurrentWorkspace/);
  });

  it("keeps listKnownWorkspaceIds off the retrieval and injection path", () => {
    // Enumeration is for reporting only. If any of these ever import it, a
    // context build could silently widen from "this workspace" to "every
    // workspace" -- exactly the leak the isolation contract exists to prevent.
    const guardedFiles = [
      "src/lib/workspace-memory/workspace-context-service.ts",
      "src/lib/workspace-memory/write-gate.ts",
      "src/lib/workspace-memory/memory-updater.ts",
    ];
    guardedFiles.forEach((path) => {
      const contents = readFileSync(join(process.cwd(), path), "utf-8");
      expect(
        contents,
        `${path} must not import listKnownWorkspaceIds`,
      ).not.toMatch(/listKnownWorkspaceIds/);
    });
  });
});
