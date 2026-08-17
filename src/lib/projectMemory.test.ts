import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMemoryContextBlock,
  clearProjectMemory,
  deleteProjectMemoryEntry,
  getProjectMemory,
  recordProjectEvent,
  recordProjectMemory,
  setProjectMemoryEntryPinned,
  subscribeProjectMemory,
} from "./projectMemory";

const PROJECT = "test-project";

describe("projectMemory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("records and reads entries per project", () => {
    recordProjectMemory(PROJECT, {
      kind: "fact",
      content: "Uses Vite + React",
      source: "ingestion",
    });
    recordProjectMemory("other-project", {
      kind: "fact",
      content: "Other repo fact",
      source: "ingestion",
    });

    const entries = getProjectMemory(PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Uses Vite + React");
    expect(getProjectMemory("other-project")).toHaveLength(1);
  });

  it("ignores empty content and missing project ids", () => {
    expect(
      recordProjectMemory(PROJECT, { kind: "fact", content: "  ", source: "x" })
    ).toBeNull();
    expect(
      recordProjectMemory("", { kind: "fact", content: "hi", source: "x" })
    ).toBeNull();
    expect(getProjectMemory(PROJECT)).toHaveLength(0);
  });

  it("replaces entries with the same dedupe key", () => {
    recordProjectMemory(PROJECT, {
      kind: "event",
      content: "Ingested 10 files",
      source: "ingestion",
      dedupeKey: "ingestion:done",
    });
    recordProjectMemory(PROJECT, {
      kind: "event",
      content: "Ingested 42 files",
      source: "ingestion",
      dedupeKey: "ingestion:done",
    });

    const entries = getProjectMemory(PROJECT);
    expect(entries).toHaveLength(1);
    expect(entries[0].content).toBe("Ingested 42 files");
  });

  it("builds a context block that leads with pinned + requirements", () => {
    recordProjectMemory(PROJECT, {
      kind: "event",
      content: "Manifest generated",
      source: "manifest",
    });
    recordProjectMemory(PROJECT, {
      kind: "requirement",
      content: "Must support offline mode",
      source: "onboarding",
      pinned: true,
    });

    const block = buildMemoryContextBlock(PROJECT);
    expect(block).toContain("PROJECT MEMORY");
    const reqIdx = block.indexOf("Must support offline mode");
    const evtIdx = block.indexOf("Manifest generated");
    expect(reqIdx).toBeGreaterThan(-1);
    expect(evtIdx).toBeGreaterThan(-1);
    expect(reqIdx).toBeLessThan(evtIdx);
  });

  it("returns empty string when no memory exists", () => {
    expect(buildMemoryContextBlock("nothing-here")).toBe("");
  });

  it("respects the maxChars budget", () => {
    for (let i = 0; i < 50; i += 1) {
      recordProjectMemory(PROJECT, {
        kind: "fact",
        content: `Fact number ${i} ${"x".repeat(120)}`,
        source: "test",
      });
    }
    const block = buildMemoryContextBlock(PROJECT, { maxChars: 600 });
    expect(block.length).toBeLessThanOrEqual(600);
    expect(block).toContain("PROJECT MEMORY");
  });

  it("deletes and clears entries", () => {
    const entry = recordProjectMemory(PROJECT, {
      kind: "fact",
      content: "temp",
      source: "test",
    });
    expect(getProjectMemory(PROJECT)).toHaveLength(1);
    deleteProjectMemoryEntry(PROJECT, entry!.id);
    expect(getProjectMemory(PROJECT)).toHaveLength(0);

    recordProjectMemory(PROJECT, {
      kind: "fact",
      content: "temp2",
      source: "test",
    });
    clearProjectMemory(PROJECT);
    expect(getProjectMemory(PROJECT)).toHaveLength(0);
  });

  it("pins curated context without rewriting the entry", () => {
    const entry = recordProjectMemory(PROJECT, {
      kind: "decision",
      content: "Keep the ingestion workflow event driven.",
      source: "user",
    });

    setProjectMemoryEntryPinned(PROJECT, entry!.id, true);
    expect(getProjectMemory(PROJECT)[0]).toMatchObject({
      id: entry!.id,
      pinned: true,
      content: "Keep the ingestion workflow event driven.",
    });

    setProjectMemoryEntryPinned(PROJECT, entry!.id, false);
    expect(getProjectMemory(PROJECT)[0].pinned).toBe(false);
  });

  it("notifies subscribers on writes", () => {
    const seen: number[] = [];
    const unsub = subscribeProjectMemory(PROJECT, (entries) => {
      seen.push(entries.length);
    });
    recordProjectEvent(PROJECT, "test", "one", "First event");
    recordProjectEvent(PROJECT, "test", "two", "Second event");
    unsub();
    recordProjectEvent(PROJECT, "test", "three", "Third event");
    expect(seen).toEqual([1, 2]);
  });
});
