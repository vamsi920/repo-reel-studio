import { describe, expect, it, beforeEach } from "vitest";
import {
  SECURITY_LAST_REPOSITORY_STORAGE_KEY,
  readLastSecurityRepositoryId,
  writeLastSecurityRepositoryId,
} from "#/lib/security/security-last-repository";

describe("security-last-repository", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("has nothing remembered yet by default", () => {
    expect(readLastSecurityRepositoryId()).toBeNull();
  });

  it("round-trips a written repository id", () => {
    writeLastSecurityRepositoryId("acme/web@main");

    expect(readLastSecurityRepositoryId()).toBe("acme/web@main");
    expect(
      window.localStorage.getItem(SECURITY_LAST_REPOSITORY_STORAGE_KEY),
    ).toBe("acme/web@main");
  });

  it("overwrites a previously remembered repository id", () => {
    writeLastSecurityRepositoryId("acme/api@main");
    writeLastSecurityRepositoryId("acme/web@main");

    expect(readLastSecurityRepositoryId()).toBe("acme/web@main");
  });
});
