import { describe, expect, it } from "vitest";
import {
  clampTargetCount,
  coerceMorningDeadline,
  normalizeProactiveConfig,
  ProactiveConfigValidationError,
  sanitizeTimezone,
  validateMorningDeadline,
  validateProactiveConfigPatch,
} from "@/lib/proactiveConfig";

describe("proactiveConfig", () => {
  it("clamps targetCount between 1 and 6", () => {
    expect(clampTargetCount(10)).toBe(6);
    expect(clampTargetCount(0)).toBe(1);
  });

  it("rejects non-numeric targetCount", () => {
    expect(() => clampTargetCount("bad")).toThrow(ProactiveConfigValidationError);
  });

  it("validates and normalizes morningDeadline", () => {
    expect(validateMorningDeadline("9:30")).toBe("09:30");
    expect(() => validateMorningDeadline("24:00")).toThrow(ProactiveConfigValidationError);
  });

  it("coerces legacy persisted deadlines on read", () => {
    expect(coerceMorningDeadline("7:15")).toBe("07:15");
    expect(coerceMorningDeadline("nope")).toBe("09:00");
  });

  it("sanitizes timezone strings", () => {
    expect(sanitizeTimezone("  America/New_York  ")).toBe("America/New_York");
    expect(sanitizeTimezone("bad\u0000zone")).not.toContain("\u0000");
  });

  it("validates config patch payloads", () => {
    expect(validateProactiveConfigPatch({ targetCount: 4, morningDeadline: "10:15" })).toEqual({
      targetCount: 4,
      morningDeadline: "10:15",
    });
    expect(() => validateProactiveConfigPatch({ morningDeadline: "noon" })).toThrow(
      ProactiveConfigValidationError,
    );
  });

  it("normalizes API config records leniently", () => {
    const normalized = normalizeProactiveConfig({
      repoUrl: "https://github.com/example/a",
      enabled: 1,
      targetCount: 12,
      morningDeadline: "8:00",
      timezone: "UTC",
      updatedAt: "t",
    });
    expect(normalized.targetCount).toBe(6);
    expect(normalized.morningDeadline).toBe("08:00");
    expect(normalized.enabled).toBe(true);
  });
});
