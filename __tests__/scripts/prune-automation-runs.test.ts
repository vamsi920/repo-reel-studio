// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pruneAutomationRuns,
  resolveRetentionDays,
} from "../../scripts/prune-automation-runs.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 7);

function makeRun(root: string, name: string, ageDays: number) {
  const dir = join(root, name);
  mkdirSync(dir);
  writeFileSync(join(dir, "file.txt"), "x".repeat(100));
  const time = new Date(NOW - ageDays * DAY_MS);
  utimesSync(dir, time, time);
  return dir;
}

describe("pruneAutomationRuns", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "prune-runs-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("removes runs older than retention and keeps recent ones", () => {
    const old = makeRun(root, "old", 5);
    const recent = makeRun(root, "recent", 1);

    const result = pruneAutomationRuns({
      dir: root,
      retentionDays: 3,
      now: NOW,
    });

    expect(existsSync(old)).toBe(false);
    expect(existsSync(recent)).toBe(true);
    expect(result).toMatchObject({ removed: 1, freedBytes: 100 });
  });

  it("never removes a run touched in the last 24 hours", () => {
    const active = makeRun(root, "active", 0.5);

    pruneAutomationRuns({ dir: root, retentionDays: 0.1, now: NOW });

    expect(existsSync(active)).toBe(true);
  });

  it("does nothing when retention is 0 (disabled)", () => {
    const old = makeRun(root, "old", 30);

    pruneAutomationRuns({ dir: root, retentionDays: 0, now: NOW });

    expect(existsSync(old)).toBe(true);
  });

  it("leaves symlinks and their targets untouched", () => {
    const outside = mkdtempSync(join(tmpdir(), "prune-target-"));
    symlinkSync(outside, join(root, "link"));

    pruneAutomationRuns({
      dir: root,
      retentionDays: 3,
      now: NOW + 100 * DAY_MS,
    });

    expect(existsSync(outside)).toBe(true);
    rmSync(outside, { recursive: true, force: true });
  });

  it("is a no-op when the directory does not exist", () => {
    const result = pruneAutomationRuns({
      dir: join(root, "missing"),
      now: NOW,
    });

    expect(result.removed).toBe(0);
  });
});

describe("resolveRetentionDays", () => {
  it.each([
    [undefined, 3],
    ["7", 7],
    ["0", 0],
    ["bogus", 3],
  ])("maps %s to %d", (raw, expected) => {
    const env = raw === undefined ? {} : { AUTOMATION_RUN_RETENTION_DAYS: raw };
    expect(resolveRetentionDays(env)).toBe(expected);
  });
});
