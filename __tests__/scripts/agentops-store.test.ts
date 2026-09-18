import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentOpsStore } from "../../scripts/agentops/store.mjs";

const RUN_ID = "600d2a7a-ead8-4b13-a02a-b6395a065e62";
const OTHER_RUN_ID = "11111111-2222-4333-8444-555555555555";
const APPROVAL_ID = `budget:${RUN_ID}:2026-09-14T16:06:01.000Z`;

describe("AgentOpsStore.listAudit", () => {
  let dir: string;
  let store: AgentOpsStore;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "agentops-store-"));
    store = new AgentOpsStore(dir);
    await store.appendAudit({
      at: "2026-09-14T16:06:01.000Z",
      actor: "system",
      action: "run.paused",
      summary: "Run halted because a budget was exceeded",
      entityType: "run",
      entityId: RUN_ID,
      workspaceId: "/workspace/project",
      metadata: {},
    });
    // The approval decision is recorded against the approval, not the run —
    // the run is only referenced through metadata.runId.
    await store.appendAudit({
      at: "2026-09-14T16:06:54.000Z",
      actor: "user",
      action: "approval.rejected",
      summary: "Rejected: Budget exceeded",
      entityType: "approval",
      entityId: APPROVAL_ID,
      workspaceId: "/workspace/project",
      metadata: { runId: RUN_ID, kind: "budget", reason: null },
    });
    await store.appendAudit({
      at: "2026-09-14T16:07:00.000Z",
      actor: "user",
      action: "approval.granted",
      summary: "Approved: Budget exceeded",
      entityType: "approval",
      entityId: `budget:${OTHER_RUN_ID}:2026-09-14T16:06:30.000Z`,
      workspaceId: "/workspace/project",
      metadata: { runId: OTHER_RUN_ID, kind: "budget", reason: null },
    });
    await store.appendAudit({
      at: "2026-09-14T16:08:00.000Z",
      actor: "user",
      action: "policy.updated",
      summary: "Policies updated",
      entityType: "policy",
      entityId: "policies",
      workspaceId: "/workspace/project",
      metadata: {},
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("includes approval decisions on the run's own trail when filtering by runId", async () => {
    const audit = await store.listAudit({ runId: RUN_ID });
    expect(audit.map((entry) => entry.action)).toEqual([
      "approval.rejected",
      "run.paused",
    ]);
  });

  it("does not leak another run's approval decision into the trail", async () => {
    const audit = await store.listAudit({ runId: RUN_ID });
    expect(audit.some((entry) => entry.metadata?.runId === OTHER_RUN_ID)).toBe(
      false,
    );
  });

  it("keeps the strict entityId filter unchanged", async () => {
    const byRun = await store.listAudit({ entityId: RUN_ID });
    expect(byRun.map((entry) => entry.action)).toEqual(["run.paused"]);

    const byApproval = await store.listAudit({ entityId: APPROVAL_ID });
    expect(byApproval.map((entry) => entry.action)).toEqual([
      "approval.rejected",
    ]);
  });

  it("survives a restart — the runId filter works on rows re-read from disk", async () => {
    const reloaded = new AgentOpsStore(dir);
    const audit = await reloaded.listAudit({ runId: RUN_ID });
    expect(audit.map((entry) => entry.action)).toEqual([
      "approval.rejected",
      "run.paused",
    ]);
  });
});

describe("AgentOpsStore.listAudit ordering", () => {
  let dir: string;
  let store: AgentOpsStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentops-store-order-"));
    store = new AgentOpsStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns rows newest-`at`-first even when they were appended out of `at` order", async () => {
    // A live-socket flush for one run can land in the store at a wall-clock
    // moment that is out of order relative to a slower REST-tail poll for a
    // different run — append order is not a reliable proxy for `at` order.
    await store.appendAudit({
      at: "2026-09-14T16:08:00.000Z",
      actor: "system",
      action: "task.completed",
      summary: "later event, appended first",
      entityType: "run",
      entityId: RUN_ID,
      workspaceId: "/workspace/project",
      metadata: {},
    });
    await store.appendAudit({
      at: "2026-09-14T16:06:00.000Z",
      actor: "system",
      action: "tool.called",
      summary: "earlier event, appended second",
      entityType: "run",
      entityId: RUN_ID,
      workspaceId: "/workspace/project",
      metadata: {},
    });

    const audit = await store.listAudit({ runId: RUN_ID });
    expect(audit.map((entry) => entry.action)).toEqual([
      "task.completed",
      "tool.called",
    ]);
  });
});
