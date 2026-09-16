import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (language?: string) => void;

const { listeners, i18nMock } = vi.hoisted(() => {
  const set = new Set<Listener>();
  return {
    listeners: set,
    i18nMock: {
      language: "en",
      resolvedLanguage: "en",
      on: vi.fn((event: string, listener: Listener) => {
        if (event === "languageChanged") set.add(listener);
      }),
      off: vi.fn((event: string, listener: Listener) => {
        if (event === "languageChanged") set.delete(listener);
      }),
    },
  };
});

vi.mock("#/i18n", () => ({ default: i18nMock }));

import { useDocumentLanguage } from "#/hooks/use-document-language";

describe("useDocumentLanguage", () => {
  beforeEach(() => {
    document.documentElement.lang = "en";
    document.documentElement.removeAttribute("dir");
    i18nMock.language = "en";
    i18nMock.resolvedLanguage = "en";
  });

  afterEach(() => {
    listeners.clear();
    vi.clearAllMocks();
  });

  it("applies the current language on mount", () => {
    i18nMock.language = "ja";
    i18nMock.resolvedLanguage = "ja";
    renderHook(() => useDocumentLanguage());
    expect(document.documentElement.lang).toBe("ja");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("follows languageChanged events and unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useDocumentLanguage());
    expect(document.documentElement.lang).toBe("en");

    listeners.forEach((listener) => listener("ar"));
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("ltr");

    unmount();
    expect(i18nMock.off).toHaveBeenCalledWith(
      "languageChanged",
      expect.any(Function),
    );
    expect(listeners.size).toBe(0);
  });
});
