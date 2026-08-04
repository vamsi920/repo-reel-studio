import { describe, expect, it } from "vitest";

import { cn, formatDate, getUserInitials } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and drops falsy values", () => {
    const disabled = false;
    expect(cn("a", disabled && "b", undefined, null, "c")).toBe("a c");
  });

  it("lets later tailwind classes win over conflicting earlier ones", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("supports conditional object syntax", () => {
    expect(cn({ hidden: false, block: true })).toBe("block");
  });
});

describe("formatDate", () => {
  it("formats an ISO date as a long US date", () => {
    expect(formatDate("2024-03-05T12:00:00.000Z")).toBe("March 5, 2024");
  });

  it("returns Invalid Date for unparsable input", () => {
    expect(formatDate("not-a-date")).toBe("Invalid Date");
  });
});

describe("getUserInitials", () => {
  it("uses the first letters of the first two name parts", () => {
    expect(getUserInitials("ada lovelace")).toBe("AL");
  });

  it("uses the first two letters of a single-word name", () => {
    expect(getUserInitials("ada")).toBe("AD");
  });

  it("falls back to the email when no name is given", () => {
    expect(getUserInitials(undefined, "ada@example.com")).toBe("AD");
  });

  it("falls back to U when nothing is given", () => {
    expect(getUserInitials()).toBe("U");
  });
});
