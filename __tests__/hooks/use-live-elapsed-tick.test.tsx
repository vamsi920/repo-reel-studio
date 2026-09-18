import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveElapsedTick } from "#/hooks/use-live-elapsed-tick";

describe("useLiveElapsedTick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps re-rendering on a timer while active", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useLiveElapsedTick(true);
    });

    const rendersAfterMount = renders;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(renders).toBeGreaterThan(rendersAfterMount);

    const rendersAfterFirstTick = renders;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(renders).toBeGreaterThan(rendersAfterFirstTick);
  });

  it("does not schedule a timer while inactive", () => {
    let renders = 0;
    renderHook(() => {
      renders += 1;
      useLiveElapsedTick(false);
    });

    const rendersAfterMount = renders;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(renders).toBe(rendersAfterMount);
  });

  it("stops ticking once it goes from active to inactive", () => {
    let renders = 0;
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) => {
        renders += 1;
        useLiveElapsedTick(active);
      },
      { initialProps: { active: true } },
    );

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    const rendersWhileActive = renders;
    expect(rendersWhileActive).toBeGreaterThan(0);

    rerender({ active: false });
    const rendersAfterDeactivate = renders;
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(renders).toBe(rendersAfterDeactivate);
  });
});
