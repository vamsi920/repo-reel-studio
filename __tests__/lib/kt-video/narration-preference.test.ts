import { describe, expect, it, beforeEach } from "vitest";
import {
  KT_NARRATION_STORAGE_KEY,
  readStoredNarrationPreference,
  writeStoredNarrationPreference,
} from "#/lib/kt-video/narration-preference";

describe("narration-preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to off when nothing has been stored yet", () => {
    expect(readStoredNarrationPreference()).toBe(false);
  });

  it("round-trips a written preference", () => {
    writeStoredNarrationPreference(true);
    expect(readStoredNarrationPreference()).toBe(true);
    expect(window.localStorage.getItem(KT_NARRATION_STORAGE_KEY)).toBe(
      "true",
    );

    writeStoredNarrationPreference(false);
    expect(readStoredNarrationPreference()).toBe(false);
  });

  it("treats any other stored value as off", () => {
    window.localStorage.setItem(KT_NARRATION_STORAGE_KEY, "garbage");
    expect(readStoredNarrationPreference()).toBe(false);
  });
});
