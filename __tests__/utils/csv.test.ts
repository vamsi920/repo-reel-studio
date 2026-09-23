import { describe, expect, it } from "vitest";
import { csvEscape } from "#/utils/csv";

describe("csvEscape", () => {
  it("neutralizes a leading formula character so spreadsheets don't auto-evaluate it", () => {
    // Arrange
    const value = "=cmd|' /C calc'!A1";

    // Act
    const escaped = csvEscape(value);

    // Assert
    expect(escaped).toBe("'=cmd|' /C calc'!A1");
  });

  it("quotes a value containing a comma instead of dropping it", () => {
    // Arrange
    const value = "reachable, but slow";

    // Act
    const escaped = csvEscape(value);

    // Assert
    expect(escaped).toBe('"reachable, but slow"');
  });

  it("leaves an ordinary value untouched", () => {
    // Arrange
    const value = "api.github.com";

    // Act & Assert
    expect(csvEscape(value)).toBe(value);
  });
});
