import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useDragResize } from "#/hooks/use-drag-resize";

// Force the mobile (touch-listener-on-grip) branch of useDragResize.
vi.mock("#/utils/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/utils/utils")>()),
  isMobileDevice: () => true,
}));

/**
 * Regression coverage: the touchmove/touchend listeners in the mobile branch
 * are attached to the grip element with `{ capture: true }`, but the old
 * cleanup called `removeEventListener` without that flag. Per the DOM spec,
 * `capture` must match for removal to take effect, so the listener was never
 * actually removed — every completed touch drag left its capturing
 * `touchmove` listener attached, and a later unrelated touchmove on the grip
 * would still move the (by-then-detached) element from a stale closure.
 */
describe("useDragResize — mobile touch listener cleanup", () => {
  let inputEl: HTMLDivElement;
  let wrapperEl: HTMLDivElement;
  let gripEl: HTMLDivElement;

  beforeEach(() => {
    wrapperEl = document.createElement("div");
    gripEl = document.createElement("div");
    gripEl.id = "resize-grip";
    const containerEl = document.createElement("div");
    inputEl = document.createElement("div");
    inputEl.style.height = "20px";
    containerEl.appendChild(inputEl);
    wrapperEl.appendChild(gripEl);
    wrapperEl.appendChild(containerEl);
    document.body.appendChild(wrapperEl);

    Object.defineProperty(inputEl, "offsetHeight", {
      get() {
        return parseFloat(inputEl.style.height || "20");
      },
      configurable: true,
    });

    vi.spyOn(wrapperEl, "getBoundingClientRect").mockReturnValue({
      top: 668,
      bottom: 768,
      left: 0,
      right: 0,
      width: 800,
      height: 100,
      x: 0,
      y: 668,
      toJSON: () => ({}),
    });
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(768);
  });

  afterEach(() => {
    wrapperEl.remove();
    vi.restoreAllMocks();
  });

  it("does not leak a capturing touchmove listener on the grip after a completed drag", () => {
    const { result } = renderHook(() =>
      useDragResize({
        elementRef: { current: inputEl },
        minHeight: 20,
        maxHeight: 400,
      }),
    );

    act(() => {
      result.current.handleGripTouchStart(
        new TouchEvent("touchstart", {
          touches: [{ clientY: 100 } as unknown as Touch],
        }) as unknown as React.TouchEvent,
      );
    });
    act(() => {
      gripEl.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 70 } as unknown as Touch],
        }),
      );
    });
    act(() => {
      gripEl.dispatchEvent(new TouchEvent("touchend"));
    });

    const heightAfterFirstDrag = parseFloat(inputEl.style.height);
    expect(heightAfterFirstDrag).toBeGreaterThan(20);

    // A second, unrelated touchmove on the grip (no drag in progress) must
    // not move the element — it would if the first drag's capturing
    // listener had leaked.
    const heightBeforeStrayMove = inputEl.style.height;
    act(() => {
      gripEl.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [{ clientY: 10 } as unknown as Touch],
        }),
      );
    });
    expect(inputEl.style.height).toBe(heightBeforeStrayMove);
  });
});
