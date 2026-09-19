import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPinnedOrder,
  getHomePinnedAutomationsKey,
  HOME_PINNED_AUTOMATIONS_KEY,
  movePinnedId,
  useHomePinnedAutomations,
} from "#/hooks/use-home-pinned-automations";

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: "test-backend", kind: "local" },
    orgId: null,
  }),
}));

describe("getHomePinnedAutomationsKey", () => {
  it("scopes the storage key by backend and org", () => {
    expect(getHomePinnedAutomationsKey("backend-a", "org-1")).toBe(
      `${HOME_PINNED_AUTOMATIONS_KEY}:backend-a:org-1`,
    );
    expect(getHomePinnedAutomationsKey("backend-a", null)).toBe(
      `${HOME_PINNED_AUTOMATIONS_KEY}:backend-a:-`,
    );
    expect(getHomePinnedAutomationsKey("backend-a", "org-1")).not.toBe(
      getHomePinnedAutomationsKey("backend-b", "org-1"),
    );
  });
});

describe("movePinnedId", () => {
  it("reorders an id before or after a target", () => {
    expect(movePinnedId(["a", "b", "c"], "c", "a", "before")).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(movePinnedId(["a", "b", "c"], "a", "b", "after")).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("applyPinnedOrder", () => {
  it("applies a preferred order while keeping unknown base ids", () => {
    expect(applyPinnedOrder(["a", "b", "c"], ["c", "a"])).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("useHomePinnedAutomations pruneMissing", () => {
  const storageKey = getHomePinnedAutomationsKey("test-backend", null);

  afterEach(() => {
    window.localStorage.removeItem(storageKey);
    vi.restoreAllMocks();
  });

  it("does not touch storage when every pinned id is still known", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["a", "b"]));
    const { result } = renderHook(() => useHomePinnedAutomations());
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    act(() => {
      result.current.pruneMissing(new Set(["a", "b", "c"]));
    });

    // Nothing was actually pruned, so the no-op must not write to
    // localStorage or broadcast a `storage` event — every other consumer of
    // this key would otherwise re-check on every render this runs in.
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(result.current.pinnedIds).toEqual(["a", "b"]);
  });

  it("drops pin ids that no longer exist and persists the change", () => {
    window.localStorage.setItem(storageKey, JSON.stringify(["a", "b", "c"]));
    const { result } = renderHook(() => useHomePinnedAutomations());

    act(() => {
      result.current.pruneMissing(new Set(["a", "c"]));
    });

    expect(result.current.pinnedIds).toEqual(["a", "c"]);
    expect(JSON.parse(window.localStorage.getItem(storageKey) ?? "[]")).toEqual(
      ["a", "c"],
    );
  });
});
