// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createRunRecovery,
  isTransientError,
  MAX_ATTEMPTS,
  recoveryDelaySeconds,
} from "../../scripts/automation-run-recovery.mjs";

// The exact shape Gemini's per-minute quota error reached the agent-server in
// (benchmark scenario A5): a 429 wrapped in litellm's BadRequestError.
const QUOTA_ERROR =
  'litellm.BadRequestError: GeminiException BadRequestError - { "error": { "code": 429, "message": "You exceeded your current quota ... Please retry in 29.886877403s." } }';

const NOW = Date.parse("2026-10-08T18:00:00Z");

function setup({
  status = "error",
  detail = QUOTA_ERROR,
  completedAt = "2026-10-08T17:59:00Z",
}: { status?: string; detail?: string; completedAt?: string } = {}) {
  const resumed: string[] = [];
  const state: Record<string, unknown> = {};
  const reply = (data: unknown) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  });
  const fetchImpl = async (url: string, init: { method?: string } = {}) => {
    if (init.method === "POST") {
      resumed.push(url);
      return reply({ success: true });
    }
    if (url.includes("/api/automation/v1?"))
      return reply({ automations: [{ id: "auto-1" }] });
    if (url.includes("/auto-1/runs?"))
      return reply({
        runs: [
          {
            id: "run-1",
            status: "FAILED",
            conversation_id: "conv-1",
            completed_at: completedAt,
          },
        ],
      });
    if (url.includes("/events/search"))
      return reply({ items: [{ kind: "ConversationErrorEvent", detail }] });
    return reply({ execution_status: status });
  };
  let clock = NOW;
  const recovery = createRunRecovery({
    automationUrl: "http://auto",
    agentUrl: "http://agent",
    key: "k",
    state,
    save: () => {},
    fetchImpl: fetchImpl as unknown as typeof fetch,
    log: { log: () => {}, error: () => {} },
    now: () => clock,
  });
  return {
    recovery,
    resumed,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe("automation run recovery", () => {
  it("classifies transient provider errors and honours the asked delay", () => {
    expect(isTransientError(QUOTA_ERROR)).toBe(true);
    expect(isTransientError("Repository not found")).toBe(false);
    // 29.9 s asked, rounded up plus a margin.
    expect(recoveryDelaySeconds(QUOTA_ERROR, 0)).toBe(35);
    expect(recoveryDelaySeconds("503 overloaded", 1)).toBe(60);
  });

  it("resumes a run that failed on a quota error once the delay has passed", async () => {
    const { recovery, resumed, advance } = setup();

    await recovery.tick(); // 60 s after failure: past the 35 s delay.
    advance(10_000);
    await recovery.tick(); // still "error", but the next attempt must wait longer.

    expect(resumed).toEqual(["http://agent/api/conversations/conv-1/run"]);
  });

  it("stops after the attempt limit", async () => {
    const { recovery, resumed, advance } = setup();

    for (let i = 0; i < 6; i += 1) {
      await recovery.tick();
      advance(10 * 60 * 1000);
    }

    expect(resumed).toHaveLength(MAX_ATTEMPTS);
  });

  it.each([
    ["a non-transient error", { detail: "Authentication failed: 401" }],
    ["a conversation that already finished", { status: "finished" }],
    [
      "a failure older than the recovery window",
      {
        completedAt: "2026-10-08T16:00:00Z",
      },
    ],
  ])("leaves %s alone", async (_label, options) => {
    const { recovery, resumed } = setup(options);

    await recovery.tick();

    expect(resumed).toHaveLength(0);
  });
});
