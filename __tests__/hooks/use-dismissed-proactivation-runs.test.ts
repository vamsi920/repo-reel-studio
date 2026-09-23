import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";

import {
  useDismissedProactivationRuns,
  DISMISSED_PROACTIVATION_RUNS_KEY,
} from "#/hooks/use-dismissed-proactivation-runs";

describe("useDismissedProactivationRuns", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("reports a run as not dismissed by default", () => {
    const { result } = renderHook(() => useDismissedProactivationRuns());

    expect(result.current.isDismissed("run-1")).toBe(false);
  });

  it("marks a run dismissed and keeps it dismissed after remount", () => {
    const { result, unmount } = renderHook(() =>
      useDismissedProactivationRuns(),
    );

    act(() => {
      result.current.dismiss("run-1");
    });

    expect(result.current.isDismissed("run-1")).toBe(true);
    expect(result.current.isDismissed("run-2")).toBe(false);

    // Simulate navigating away and back (a fresh mount reads localStorage
    // again instead of relying on in-memory component state).
    unmount();
    const { result: afterRemount } = renderHook(() =>
      useDismissedProactivationRuns(),
    );

    expect(afterRemount.current.isDismissed("run-1")).toBe(true);
  });

  it("ignores malformed persisted values instead of throwing", () => {
    window.localStorage.setItem(
      DISMISSED_PROACTIVATION_RUNS_KEY,
      JSON.stringify({ not: "an array" }),
    );

    const { result } = renderHook(() => useDismissedProactivationRuns());

    expect(result.current.isDismissed("run-1")).toBe(false);
  });

  it("does not add a duplicate entry when dismissing the same run twice", () => {
    const { result } = renderHook(() => useDismissedProactivationRuns());

    act(() => {
      result.current.dismiss("run-1");
    });
    act(() => {
      result.current.dismiss("run-1");
    });

    const stored = JSON.parse(
      window.localStorage.getItem(DISMISSED_PROACTIVATION_RUNS_KEY) ?? "[]",
    );
    expect(stored).toEqual(["run-1"]);
  });
});
