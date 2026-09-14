import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeOAuthReceiptOnce,
  resetOAuthReceiptGuardForTests,
} from "#/lib/environment/oauth-receipt-guard";

describe("consumeOAuthReceiptOnce", () => {
  beforeEach(() => {
    resetOAuthReceiptGuardForTests();
  });

  it("returns true the first time a key is consumed", () => {
    expect(consumeOAuthReceiptOnce("github")).toBe(true);
  });

  it("returns false for a repeated key in the same page load", () => {
    consumeOAuthReceiptOnce("github");
    expect(consumeOAuthReceiptOnce("github")).toBe(false);
  });

  it("treats different keys independently", () => {
    expect(consumeOAuthReceiptOnce("github")).toBe(true);
    expect(consumeOAuthReceiptOnce("jira-cloud")).toBe(true);
  });

  it("allows a key to be consumed again after a reset (a fresh page load)", () => {
    consumeOAuthReceiptOnce("github");
    resetOAuthReceiptGuardForTests();
    expect(consumeOAuthReceiptOnce("github")).toBe(true);
  });
});
