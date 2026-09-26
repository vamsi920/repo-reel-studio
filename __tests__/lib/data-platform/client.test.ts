import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { timedFetch } from "#/lib/data-platform/client";

describe("timedFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts the request after the hard timeout when no signal is supplied", () => {
    void timedFetch("https://example.test/resource");

    const passedSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(passedSignal.aborted).toBe(false);

    vi.advanceTimersByTime(8000);

    expect(passedSignal.aborted).toBe(true);
  });

  it("still enforces the hard timeout when the caller supplies its own signal", () => {
    const callerController = new AbortController();
    void timedFetch("https://example.test/resource", {
      signal: callerController.signal,
    });

    const passedSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    // Regression guard: a prior version replaced the timeout signal with the
    // caller's signal instead of combining them, so the 8s timer fired but
    // had no effect on the actual fetch call.
    expect(passedSignal).not.toBe(callerController.signal);

    vi.advanceTimersByTime(8000);

    expect(passedSignal.aborted).toBe(true);
  });

  it("propagates the caller's own cancellation through the combined signal", () => {
    const callerController = new AbortController();
    void timedFetch("https://example.test/resource", {
      signal: callerController.signal,
    });

    const passedSignal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(passedSignal.aborted).toBe(false);

    callerController.abort();

    expect(passedSignal.aborted).toBe(true);
  });
});
