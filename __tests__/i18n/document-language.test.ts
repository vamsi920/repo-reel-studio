import { describe, expect, it } from "vitest";
import { applyDocumentLanguage, isRtlLanguage } from "#/i18n/document-language";

const makeDoc = (lang = "en", dir = "") => ({
  documentElement: { lang, dir } as HTMLElement,
});

describe("document-language", () => {
  it("mirrors the language onto <html lang> and pins dir to ltr", () => {
    const doc = makeDoc();
    applyDocumentLanguage("ja", doc);
    expect(doc.documentElement.lang).toBe("ja");
    expect(doc.documentElement.dir).toBe("ltr");
  });

  it("keeps the layout left-to-right for Arabic until the layout is RTL-ready", () => {
    const doc = makeDoc();
    applyDocumentLanguage("ar", doc);
    expect(doc.documentElement.lang).toBe("ar");
    expect(doc.documentElement.dir).toBe("ltr");
  });

  it("preserves region subtags", () => {
    const doc = makeDoc();
    applyDocumentLanguage("zh-TW", doc);
    expect(doc.documentElement.lang).toBe("zh-TW");
  });

  it("ignores an unresolved language", () => {
    const doc = makeDoc("en", "");
    applyDocumentLanguage(undefined, doc);
    expect(doc.documentElement.lang).toBe("en");
    expect(doc.documentElement.dir).toBe("");
  });

  it("recognises right-to-left languages by base tag", () => {
    expect(isRtlLanguage("ar")).toBe(true);
    expect(isRtlLanguage("ar-EG")).toBe(true);
    expect(isRtlLanguage("ja")).toBe(false);
    expect(isRtlLanguage(undefined)).toBe(false);
  });
});
