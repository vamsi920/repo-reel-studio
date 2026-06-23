import { describe, expect, it } from "vitest";
import {
  computeProactivePollIntervalMs,
  computeRunsPollIntervalMs,
  createSerialTaskRunner,
  nextFailureCount,
  POLL_BACKOFF_MAX_MS,
  PROACTIVE_POLL_ACTIVE_MS,
  PROACTIVE_POLL_IDLE_MS,
} from "@/lib/agentOpsPolling";

describe("agentOpsPolling intervals", () => {
  it("uses active interval while work is in flight", () => {
    expect(
      computeProactivePollIntervalMs({
        backendUnavailable: false,
        consecutiveFailures: 0,
        workActive: true,
      }),
    ).toBe(PROACTIVE_POLL_ACTIVE_MS);
  });

  it("backs off when backend is unavailable", () => {
    const first = computeProactivePollIntervalMs({
      backendUnavailable: true,
      consecutiveFailures: 1,
      workActive: false,
    });
    const second = computeProactivePollIntervalMs({
      backendUnavailable: true,
      consecutiveFailures: 3,
      workActive: false,
    });
    expect(first).toBeGreaterThanOrEqual(3000);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThanOrEqual(POLL_BACKOFF_MAX_MS);
  });

  it("computeRunsPollIntervalMs respects backoff", () => {
    const interval = computeRunsPollIntervalMs({
      backendUnavailable: true,
      consecutiveFailures: 2,
      workActive: true,
    });
    expect(interval).toBeGreaterThan(PROACTIVE_POLL_ACTIVE_MS);
  });

  it("nextFailureCount resets on success", () => {
    expect(nextFailureCount(4, true)).toBe(0);
    expect(nextFailureCount(2, false)).toBe(3);
  });
});

describe("createSerialTaskRunner", () => {
  it("skips overlapping calls while a task is running", async () => {
    const runner = createSerialTaskRunner();
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return "ok";
    };

    const [first, second] = await Promise.all([runner.run(task), runner.run(task)]);
    expect(first.status).toBe("completed");
    expect(second.status).toBe("skipped");
    expect(maxActive).toBe(1);
  });

});
