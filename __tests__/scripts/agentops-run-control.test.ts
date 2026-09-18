import { describe, expect, it, vi } from "vitest";

import {
  RunControlError,
  controlRun,
  evaluateRunControl,
  resumeAfterApproval,
} from "../../scripts/agentops/run-control.mjs";

const NOW = "2026-09-14T02:00:00.000Z";

function makeStore(run: Record<string, unknown> | null) {
  return {
    getRun: vi.fn().mockResolvedValue(run),
    appendAudit: vi.fn().mockResolvedValue({ id: "audit-1" }),
  };
}

function makeClient(executionStatus: string | null) {
  const notFound = Object.assign(new Error("agent-server GET failed: 404"), {
    status: 404,
  });
  return {
    getConversation:
      executionStatus === null
        ? vi.fn().mockRejectedValue(notFound)
        : vi.fn().mockResolvedValue({
            id: "run-1",
            execution_status: executionStatus,
          }),
    interruptConversation: vi.fn().mockResolvedValue({ success: true }),
    runConversation: vi.fn().mockResolvedValue({ success: true }),
  };
}

const RUN = { runId: "run-1", workspaceId: "/workspace/project" };

describe("evaluateRunControl", () => {
  it("refuses every control on a stuck run", () => {
    for (const action of ["pause", "resume", "cancel"] as const) {
      const verdict = evaluateRunControl(action, "stuck");
      expect(verdict.ok).toBe(false);
      expect(verdict.status).toBe("stuck");
      expect(verdict).toMatchObject({
        reason: expect.stringContaining("new message"),
      });
    }
  });

  it("forwards pause and stop for a run the runtime is working on", () => {
    expect(evaluateRunControl("pause", "running")).toEqual({
      ok: true,
      status: "running",
    });
    expect(evaluateRunControl("cancel", "running")).toEqual({
      ok: true,
      status: "running",
    });
  });

  it("refuses stop on a paused run, which the runtime would ignore", () => {
    // `interrupt()` on a PAUSED conversation falls back to `pause()`, which
    // only acts on IDLE/RUNNING — so the run would stay paused, in Live Runs,
    // with a "cancelled" audit row about a run that is still there.
    const verdict = evaluateRunControl("cancel", "paused");
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe("paused");
    expect(verdict).toMatchObject({
      reason: expect.stringContaining("ignores Stop on a paused run"),
    });
  });

  it("refuses stop on an idle run, which would just pause it instead", () => {
    // `interrupt()` on an IDLE conversation falls back to `pause()`, which
    // *does* act on IDLE — so the run really moves to PAUSED, but there was
    // no in-flight task to cancel, so a "cancelled" audit row would
    // misdescribe a run that just got paused.
    const verdict = evaluateRunControl("cancel", "idle");
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe("idle");
    expect(verdict).toMatchObject({
      reason: expect.stringContaining("no in-flight task"),
    });
  });

  it("refuses stop on a run waiting for confirmation, which the runtime would ignore", () => {
    // Neither IDLE nor RUNNING, so even `pause()`'s fallback does nothing —
    // approve or reject the pending action in the Approvals queue instead.
    const verdict = evaluateRunControl("cancel", "waiting_for_confirmation");
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe("waiting_for_confirmation");
    expect(verdict).toMatchObject({
      reason: expect.stringContaining("Approvals queue"),
    });
  });

  it("refuses pause on a run waiting for confirmation, which the runtime would ignore", () => {
    // Same reasoning as stop: neither IDLE nor RUNNING, so `pause()` (and
    // `interrupt()`'s fallback to it) does nothing — approve or reject the
    // pending action in the Approvals queue instead.
    const verdict = evaluateRunControl("pause", "waiting_for_confirmation");
    expect(verdict.ok).toBe(false);
    expect(verdict.status).toBe("waiting_for_confirmation");
    expect(verdict).toMatchObject({
      reason: expect.stringContaining("Approvals queue"),
    });
  });

  it("refuses pause and stop once the run is over", () => {
    expect(evaluateRunControl("pause", "finished").ok).toBe(false);
    expect(evaluateRunControl("cancel", "error").ok).toBe(false);
    expect(evaluateRunControl("pause", "paused").ok).toBe(false);
  });

  it("forwards resume only for a halted-but-restartable run", () => {
    expect(evaluateRunControl("resume", "paused").ok).toBe(true);
    expect(evaluateRunControl("resume", "idle").ok).toBe(true);
    expect(evaluateRunControl("resume", "error").ok).toBe(true);
    expect(evaluateRunControl("resume", "running").ok).toBe(false);
    expect(evaluateRunControl("resume", "finished").ok).toBe(false);
  });
});

describe("controlRun", () => {
  it("interrupts a running conversation and records the cancellation", async () => {
    const store = makeStore(RUN);
    const client = makeClient("running");

    const result = await controlRun({
      client,
      store,
      runId: "run-1",
      action: "cancel",
      now: NOW,
    });

    expect(result).toEqual({
      ok: true,
      action: "cancel",
      runId: "run-1",
      status: "running",
    });
    expect(client.interruptConversation).toHaveBeenCalledWith("run-1");
    expect(store.appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "run.cancel",
        actor: "user",
        entityId: "run-1",
        workspaceId: "/workspace/project",
      }),
    );
  });

  it("refuses to stop a stuck run and leaves no audit row", async () => {
    // Regression: the runtime answers 200 to /interrupt on a stuck
    // conversation without changing anything. The tower used to record
    // "run.cancel" anyway, so the audit said "cancelled" about a run that
    // was still there.
    const store = makeStore(RUN);
    const client = makeClient("stuck");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "cancel", now: NOW }),
    ).rejects.toMatchObject({
      name: "RunControlError",
      status: 409,
      runtimeStatus: "stuck",
      message: expect.stringContaining("stuck"),
    });
    expect(client.interruptConversation).not.toHaveBeenCalled();
    expect(client.runConversation).not.toHaveBeenCalled();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses to stop a paused run and leaves no audit row", async () => {
    // A budget halt paused the run; Stop from the Control Tower was accepted,
    // did nothing at the runtime, and wrote "Run cancelled from the Control
    // Tower" above a run that stayed paused in Live Runs indefinitely.
    const store = makeStore({ ...RUN, status: "paused" });
    const client = makeClient("paused");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "cancel", now: NOW }),
    ).rejects.toMatchObject({
      name: "RunControlError",
      status: 409,
      runtimeStatus: "paused",
      message: expect.stringContaining("paused"),
    });
    expect(client.interruptConversation).not.toHaveBeenCalled();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses to stop an idle run and leaves no audit row", async () => {
    // Regression: `/interrupt` on an idle conversation falls back to
    // `pause()`, which succeeds on IDLE — so the tower used to record
    // "run.cancel" for a run that had simply been paused, not cancelled.
    const store = makeStore({ ...RUN, status: "idle" });
    const client = makeClient("idle");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "cancel", now: NOW }),
    ).rejects.toMatchObject({
      name: "RunControlError",
      status: 409,
      runtimeStatus: "idle",
      message: expect.stringContaining("no in-flight task"),
    });
    expect(client.interruptConversation).not.toHaveBeenCalled();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses to stop a run waiting for confirmation and leaves no audit row", async () => {
    // Regression: the run is neither idle nor running, so `/interrupt`'s
    // `pause()` fallback does nothing at all — the tower still recorded
    // "run.cancel" as if it had.
    const store = makeStore({ ...RUN, status: "waiting_for_confirmation" });
    const client = makeClient("waiting_for_confirmation");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "cancel", now: NOW }),
    ).rejects.toMatchObject({
      name: "RunControlError",
      status: 409,
      runtimeStatus: "waiting_for_confirmation",
      message: expect.stringContaining("Approvals queue"),
    });
    expect(client.interruptConversation).not.toHaveBeenCalled();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("refuses to pause a run waiting for confirmation and leaves no audit row", async () => {
    // Regression: only `cancel` on `waiting_for_confirmation` was refused;
    // `pause` fell through to the generic "ok" branch and forwarded
    // `/interrupt` anyway, recording a misleading "Run paused from the
    // Control Tower" audit row for a run that never left
    // waiting_for_confirmation.
    const store = makeStore({ ...RUN, status: "waiting_for_confirmation" });
    const client = makeClient("waiting_for_confirmation");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "pause", now: NOW }),
    ).rejects.toMatchObject({
      name: "RunControlError",
      status: 409,
      runtimeStatus: "waiting_for_confirmation",
      message: expect.stringContaining("Approvals queue"),
    });
    expect(client.interruptConversation).not.toHaveBeenCalled();
    expect(store.appendAudit).not.toHaveBeenCalled();
  });

  it("judges the control against the runtime's live status, not the store's copy", async () => {
    // The store still says "running" (one poll interval stale); the runtime
    // has already halted the run.
    const store = makeStore({ ...RUN, status: "running" });
    const client = makeClient("stuck");

    await expect(
      controlRun({ client, store, runId: "run-1", action: "pause", now: NOW }),
    ).rejects.toBeInstanceOf(RunControlError);
    expect(client.getConversation).toHaveBeenCalledWith("run-1");
  });

  it("404s a run the collector has never recorded", async () => {
    const store = makeStore(null);
    const client = makeClient("running");
    await expect(
      controlRun({ client, store, runId: "nope", action: "pause", now: NOW }),
    ).rejects.toMatchObject({ status: 404 });
    expect(client.getConversation).not.toHaveBeenCalled();
  });

  it("409s when the runtime no longer has the conversation", async () => {
    const store = makeStore(RUN);
    const client = makeClient(null);
    await expect(
      controlRun({ client, store, runId: "run-1", action: "cancel", now: NOW }),
    ).rejects.toMatchObject({
      status: 409,
      runtimeStatus: null,
      message: expect.stringContaining("no longer has this conversation"),
    });
    expect(store.appendAudit).not.toHaveBeenCalled();
  });
});

describe("resumeAfterApproval", () => {
  it("restarts a paused run", async () => {
    const client = makeClient("paused");
    await expect(
      resumeAfterApproval({ client, runId: "run-1" }),
    ).resolves.toEqual({ resumed: true, status: "paused", reason: null });
    expect(client.runConversation).toHaveBeenCalledWith("run-1");
  });

  it("does not pretend to restart a stuck run", async () => {
    // /run on a stuck conversation flips running→stuck within milliseconds;
    // the approval still raises the limit, but must say the run did not go.
    const client = makeClient("stuck");
    const outcome = await resumeAfterApproval({ client, runId: "run-1" });
    expect(outcome.resumed).toBe(false);
    expect(outcome.status).toBe("stuck");
    expect(outcome.reason).toContain("new message");
    expect(client.runConversation).not.toHaveBeenCalled();
  });
});
