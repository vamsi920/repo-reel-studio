import { beforeEach, describe, expect, it } from "vitest";

import {
  resetWorkspaceMemoryStorage,
  writeRecords,
} from "#/api/workspace-memory/workspace-memory-store.api";

import { makeRecord } from "./test-fixtures";
import { computeWorkspaceId } from "./workspace-id";
import WorkspaceContextService, {
  resetRecordSource,
  taskBucket,
} from "./workspace-context-service";

const WORKSPACE = computeWorkspaceId("backend-1", "/w/a")!;

function seed() {
  const record = makeRecord({
    subject: "payments:transport",
    statement:
      "Payments moved to gRPC; the REST gateway is retained only for legacy webhooks.",
    provenance: {
      source: "repository-evidence",
      conversationId: "conv-1",
      observedAt: "2026-03-01T00:00:00.000Z",
      filePath: "services/payments/proto/payments.proto",
      commitSha: "aaa",
      repositoryId: "acme/payments",
    },
  });
  writeRecords(WORKSPACE, [{ ...record, workspaceId: WORKSPACE }]);
}

function build(commitSha: string | null) {
  return WorkspaceContextService.buildContext({
    workspaceId: WORKSPACE,
    task: "how does the payments service communicate",
    repositoryId: "acme/payments",
    conversationId: "conv-1",
    tokenBudget: 2000,
    commitSha,
  });
}

beforeEach(() => {
  resetWorkspaceMemoryStorage();
  WorkspaceContextService.resetCache();
  resetRecordSource();
  seed();
});

describe("context cache", () => {
  it("misses on the first build and hits on an identical rebuild", () => {
    const first = build("aaa");
    expect(first.fromCache).toBe(false);
    expect(first.sample.cachedTokensReused).toBe(0);
    expect(first.text).not.toBe("");

    const second = build("aaa");
    expect(second.fromCache).toBe(true);
    expect(second.sample.cachedTokensReused).toBeGreaterThan(0);
    expect(second.text).toBe(first.text);
  });

  it("misses when the repository commit changes", () => {
    build("aaa");
    const afterSha = build("bbb");
    expect(afterSha.fromCache).toBe(false);
    expect(afterSha.sample.cachedTokensReused).toBe(0);
  });

  it("misses after a new memory is written, at an unchanged commit", () => {
    build("aaa");
    expect(build("aaa").fromCache).toBe(true);

    WorkspaceContextService.invalidate(WORKSPACE);

    expect(build("aaa").fromCache).toBe(false);
  });

  it("hits across trivially different phrasings of the same task", () => {
    WorkspaceContextService.buildContext({
      workspaceId: WORKSPACE,
      task: "How does the payments service communicate?",
      conversationId: "conv-1",
      tokenBudget: 2000,
      commitSha: "aaa",
    });
    const second = WorkspaceContextService.buildContext({
      workspaceId: WORKSPACE,
      task: "how does the payments service communicate",
      conversationId: "conv-1",
      tokenBudget: 2000,
      commitSha: "aaa",
    });
    expect(second.fromCache).toBe(true);
  });

  it("keeps workspaces without a commit sha on their own key", () => {
    const noSha = build(null);
    expect(noSha.fromCache).toBe(false);
    expect(build(null).fromCache).toBe(true);
    // A sha-less build must not satisfy a sha-bearing one.
    expect(build("aaa").fromCache).toBe(false);
  });
});

describe("taskBucket", () => {
  it("ignores punctuation, case, ordering and stop words", () => {
    expect(taskBucket("How does the payments service communicate?")).toBe(
      taskBucket("communicate payments service does"),
    );
  });

  it("separates genuinely different tasks", () => {
    expect(taskBucket("rename the billing module")).not.toBe(
      taskBucket("how does the payments service communicate"),
    );
  });
});
