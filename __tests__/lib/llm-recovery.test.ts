import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LLM_RECOVERY_MESSAGE,
  MAX_RECOVERIES,
  eventTime,
  maybeRecoverFromProviderRejection,
  shouldRecover,
} from "#/lib/llm-recovery";

const GEMINI_400 =
  "litellm.BadRequestError: Vertex_ai_betaException BadRequestError - INVALID_ARGUMENT - Request contains an invalid argument.";
const NOW = Date.parse("2026-10-30T15:00:00Z");

describe("shouldRecover", () => {
  it("recovers only from Gemini's transient INVALID_ARGUMENT, only while fresh, a few times", () => {
    expect(
      shouldRecover({
        detail: GEMINI_400,
        errorAt: NOW - 1000,
        now: NOW,
        previous: [],
      }),
    ).toBe(true);
    expect(
      shouldRecover({
        detail: "AuthenticationError: bad key",
        errorAt: NOW,
        now: NOW,
        previous: [],
      }),
    ).toBe(false);
    // An error replayed from history is not the live run.
    expect(
      shouldRecover({
        detail: GEMINI_400,
        errorAt: NOW - 10 * 60_000,
        now: NOW,
        previous: [],
      }),
    ).toBe(false);
    const recent = Array.from(
      { length: MAX_RECOVERIES },
      (_, i) => NOW - i * 1000,
    );
    expect(
      shouldRecover({
        detail: GEMINI_400,
        errorAt: NOW,
        now: NOW,
        previous: recent,
      }),
    ).toBe(false);
    expect(
      shouldRecover({
        detail: GEMINI_400,
        errorAt: NOW,
        now: NOW,
        previous: recent.map((t) => t - 3_600_000),
      }),
    ).toBe(true);
  });

  it("reads zone-less agent-server timestamps as whichever reading is closest to now", () => {
    expect(eventTime("2026-10-30T15:00:00", NOW)).toBeGreaterThan(0);
    expect(
      Math.abs(NOW - eventTime("2026-10-30T14:59:30", NOW)!),
    ).toBeLessThanOrEqual(Math.abs(NOW - Date.parse("2026-10-30T14:59:30")));
    expect(eventTime(null, NOW)).toBeNull();
  });
});

describe("maybeRecoverFromProviderRejection", () => {
  beforeEach(() => localStorage.clear());

  it("sends the recovery message once per error event, across tabs", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const args = {
      conversationId: "c1",
      eventId: "e1",
      detail: GEMINI_400,
      timestamp: new Date(NOW).toISOString(),
      send,
      now: NOW,
    };
    expect(await maybeRecoverFromProviderRejection(args)).toBe(true);
    expect(await maybeRecoverFromProviderRejection(args)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(LLM_RECOVERY_MESSAGE);
  });

  it("stops after the limit for a conversation", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    for (let i = 0; i < MAX_RECOVERIES + 2; i += 1) {
      await maybeRecoverFromProviderRejection({
        conversationId: "c2",
        eventId: `e${i}`,
        detail: GEMINI_400,
        timestamp: new Date(NOW).toISOString(),
        send,
        now: NOW + i,
      });
    }
    expect(send).toHaveBeenCalledTimes(MAX_RECOVERIES);
  });
});
