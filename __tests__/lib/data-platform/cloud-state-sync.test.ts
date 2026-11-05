import { describe, expect, it } from "vitest";
import {
  mergeSyncedValue,
  syncBaseOf,
} from "#/lib/data-platform/cloud-state-sync";

const project = (id: string, updatedAt: string, name = id) => ({
  id,
  name,
  updatedAt,
});

describe("cloud state merge", () => {
  it("keeps projects made in either browser and the newer copy of a shared one", () => {
    const local = {
      state: {
        projects: {
          a: project("a", "2026-11-05T10:00:00Z", "a-local"),
          b: project("b", "2026-11-05T09:00:00Z"),
        },
        activeProjectId: "b",
      },
      version: 2,
    };
    const remote = {
      state: {
        projects: {
          a: project("a", "2026-11-05T11:00:00Z", "a-remote"),
          c: project("c", "2026-11-05T08:00:00Z"),
        },
        activeProjectId: "c",
      },
      version: 2,
    };

    const merged = mergeSyncedValue(local, remote, {}, true) as typeof local;

    expect(Object.keys(merged.state.projects).sort()).toEqual(["a", "b", "c"]);
    expect(merged.state.projects.a.name).toBe("a-remote");
    expect(merged.state.activeProjectId).toBe("c");
    expect(merged.version).toBe(2);
  });

  it("does not bring back a project deleted after the last sync", () => {
    const synced = {
      state: { projects: { a: project("a", "1"), b: project("b", "1") } },
    };
    const base = syncBaseOf(synced);
    const localAfterDelete = { state: { projects: { a: project("a", "1") } } };

    const merged = mergeSyncedValue(localAfterDelete, synced, base, true) as {
      state: { projects: Record<string, unknown> };
    };

    expect(Object.keys(merged.state.projects)).toEqual(["a"]);
  });

  it("merges lists of records by id, keeping the newer copy (workspace memory)", () => {
    const merged = mergeSyncedValue(
      {
        ws1: [
          { id: "m1", createdAt: "1", supersededAt: null },
          { id: "m2", createdAt: "1", supersededAt: null },
        ],
      },
      {
        ws1: [
          { id: "m1", createdAt: "1", supersededAt: "2" },
          { id: "m3", createdAt: "3", supersededAt: null },
        ],
      },
      {},
      true,
    ) as Record<string, Array<{ id: string; supersededAt: string | null }>>;

    expect(merged.ws1.map((r) => r.id)).toEqual(["m1", "m2", "m3"]);
    expect(merged.ws1[0].supersededAt).toBe("2");
  });

  it("merges plain records such as conversation metadata", () => {
    const merged = mergeSyncedValue(
      { "conv-1": { selected_repository: "acme/app" } },
      { "conv-2": { selected_repository: "acme/api" } },
      {},
      true,
    );

    expect(Object.keys(merged ?? {}).sort()).toEqual(["conv-1", "conv-2"]);
  });
});
