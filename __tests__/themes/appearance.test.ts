import { afterEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_ATTRIBUTE,
  APPEARANCE_STORAGE_KEY,
  DARK_COOL_GREY,
  applyAppearance,
  buildDarkAppearanceCss,
  persistAppearance,
  readPersistedAppearance,
  resolveAppearance,
} from "#/themes/appearance";

describe("appearance", () => {
  afterEach(() => {
    localStorage.clear();
    document.getElementById("oh-appearance-dark")?.remove();
    document.documentElement.removeAttribute(APPEARANCE_ATTRIBUTE);
  });

  it.each([
    ["system", true, "dark"],
    ["system", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
  ] as const)(
    "resolves %s with prefersDark=%s to %s",
    (mode, prefersDark, expected) => {
      expect(resolveAppearance(mode, prefersDark)).toBe(expected);
    },
  );

  it("persists a valid mode and falls back to system for garbage", () => {
    expect(readPersistedAppearance()).toBe("system");
    persistAppearance("dark");
    expect(readPersistedAppearance()).toBe("dark");
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "sepia");
    expect(readPersistedAppearance()).toBe("system");
  });

  it("the dark ramp is the light ramp inverted, declared on the scope roots", () => {
    expect(DARK_COOL_GREY["950"]).toBe("#0B0E14");
    expect(DARK_COOL_GREY["50"]).toBe("#F7F9FC");
    const css = buildDarkAppearanceCss();
    expect(css).toContain(
      `[data-agent-server-ui][${APPEARANCE_ATTRIBUTE}="dark"]`,
    );
    expect(css).toContain("--cool-grey-950: #0B0E14");
    expect(css).toContain("color-scheme: dark");
  });

  it("applyAppearance stamps the attribute on every scope root once", () => {
    document.body.setAttribute("data-agent-server-ui", "");
    const inner = document.createElement("div");
    inner.setAttribute("data-agent-server-ui", "");
    document.body.appendChild(inner);

    applyAppearance("dark");
    applyAppearance("dark");
    expect(document.querySelectorAll("#oh-appearance-dark")).toHaveLength(1);
    expect(document.body.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
    expect(inner.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyAppearance("light");
    expect(inner.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("light");
    inner.remove();
    document.body.removeAttribute("data-agent-server-ui");
  });
});
