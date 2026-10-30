import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LOG_ENTRIES,
  MAX_RUNS,
  cacheRun,
  getCachedRun,
  useSynthStudioStore,
  type SynthRun,
} from "#/stores/synth-studio-store";
import type { Entity } from "#/lib/synth/model";

function entity(
  id: string,
  fields: Entity["fields"],
  evidence: string[] = [],
): Entity {
  return { id, name: id, fields, evidence };
}

function run(id: string): SynthRun {
  return {
    id,
    scenarioId: "smoke",
    scenarioName: "Smoke",
    seed: 1,
    modelHash: "x",
    formats: ["json"],
    startedAt: "2026-10-21T12:00:00Z",
    finishedAt: "2026-10-21T12:00:01Z",
    rowsTotal: 1,
    rowsPerEntity: { a: 1 },
    edgeRowsPerEntity: {},
    validation: { ok: true, checksTotal: 1, checksPassed: 1, failed: [] },
    warnings: [],
    writtenFiles: [],
    preview: {},
    triggeredBy: "user",
  };
}

describe("synth studio store", () => {
  beforeEach(() => {
    useSynthStudioStore.getState().reset();
  });

  it("creates a project as the active one and round-trips its conversation id", () => {
    const store = useSynthStudioStore.getState();
    const project = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    });
    expect(useSynthStudioStore.getState().activeProjectId).toBe(project.id);
    store.setConversationId(project.id, "c1");
    expect(
      useSynthStudioStore.getState().projects[project.id].conversationId,
    ).toBe("c1");
    store.removeProject(project.id);
    expect(useSynthStudioStore.getState().activeProjectId).toBeNull();
  });

  it("merges entities by id: later mentions add fields and evidence, never erase, unless replace is asked", () => {
    const store = useSynthStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.upsertEntities(id, [
      entity(
        "user",
        [
          { name: "id", type: "integer", primaryKey: true },
          { name: "email", type: "string", unique: true },
        ],
        ["a.ts"],
      ),
    ]);
    store.upsertEntities(id, [
      entity(
        "user",
        [
          { name: "email", type: "string", semantic: "email" },
          { name: "phone", type: "string" },
        ],
        ["b.ts"],
      ),
    ]);
    const user = useSynthStudioStore.getState().projects[id].model.entities[0];
    expect(user.fields.map((f) => f.name)).toEqual(["id", "email", "phone"]);
    expect(user.fields[1]).toMatchObject({ unique: true, semantic: "email" });
    expect(user.evidence).toEqual(["a.ts", "b.ts"]);
    store.upsertEntities(
      id,
      [entity("order", [{ name: "id", type: "integer" }])],
      { replace: true },
    );
    expect(
      useSynthStudioStore
        .getState()
        .projects[id].model.entities.map((e) => e.id),
    ).toEqual(["order"]);
  });

  it("edits field meaning and distribution, removes entities with their rules", () => {
    const store = useSynthStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.upsertEntities(id, [
      entity("order", [{ name: "amount", type: "integer" }]),
    ]);
    store.upsertRules(id, [
      {
        id: "r1",
        entity: "order",
        description: "d",
        spec: { kind: "range", field: "amount", min: 0 },
      },
    ]);
    store.setFieldSemantic(id, "order", "amount", "price");
    store.setFieldDistribution(id, "order", "amount", {
      kind: "uniform",
      min: 1,
      max: 9,
    });
    let model = useSynthStudioStore.getState().projects[id].model;
    expect(model.entities[0].fields[0]).toMatchObject({
      semantic: "price",
      distribution: { kind: "uniform" },
    });
    store.setFieldDistribution(id, "order", "amount", null);
    expect(
      useSynthStudioStore.getState().projects[id].model.entities[0].fields[0]
        .distribution,
    ).toBeUndefined();
    store.removeEntity(id, "order");
    model = useSynthStudioStore.getState().projects[id].model;
    expect(model.entities).toEqual([]);
    expect(model.rules).toEqual([]);
  });

  it("answers questions, records verification on runs, bounds log and runs, and caches datasets per tab", () => {
    const store = useSynthStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.askQuestion(id, {
      id: "q",
      title: "Q",
      kind: "single",
      options: [{ id: "a", label: "A" }],
      allowOther: true,
      status: "open",
      selected: [],
      at: "2026-10-21T12:00:00Z",
    });
    expect(store.answerQuestion(id, "q", ["a"])?.status).toBe("answered");
    expect(store.answerQuestion(id, "missing", [])).toBeNull();

    for (let i = 0; i < MAX_RUNS + 3; i++) store.addRun(id, run(`r${i}`));
    expect(useSynthStudioStore.getState().projects[id].runs).toHaveLength(
      MAX_RUNS,
    );
    const last = `r${MAX_RUNS + 2}`;
    expect(
      store.setRunVerification(id, last, {
        rowsLoaded: 5,
        at: "2026-10-21T12:00:00Z",
      })?.verification?.rowsLoaded,
    ).toBe(5);
    expect(
      store.setRunVerification(id, "r0", { rowsLoaded: 5, at: "" }),
    ).toBeNull();

    for (let i = 0; i < MAX_LOG_ENTRIES + 10; i++)
      store.appendLog(id, { id: `l${i}`, level: "info", text: "x", at: "" });
    expect(useSynthStudioStore.getState().projects[id].log).toHaveLength(
      MAX_LOG_ENTRIES,
    );

    store.setReport(id, { summary: "ok", artifacts: [], at: "" });
    expect(useSynthStudioStore.getState().projects[id].status).toBe("done");

    const cached = {
      dataset: { tables: {} } as never,
      files: [],
      validation: { ok: true } as never,
    };
    cacheRun("x1", cached);
    expect(getCachedRun("x1")).toBe(cached);
    store.reset();
    expect(getCachedRun("x1")).toBeUndefined();
  });

  it("updateField sets user-owned field settings and removes cleared ones", () => {
    const store = useSynthStudioStore.getState();
    const { id } = store.createProject({
      name: "p",
      source: { kind: "folder", name: "/p" },
    });
    store.upsertEntities(id, [
      entity("users", [{ name: "ssn", type: "string" }]),
    ]);
    store.updateField(id, "users", "ssn", {
      pii: "direct",
      treatment: "redact",
      context: "US SSN",
      examples: ["x"],
    });
    let field =
      useSynthStudioStore.getState().projects[id].model.entities[0].fields[0];
    expect(field).toMatchObject({
      pii: "direct",
      treatment: "redact",
      context: "US SSN",
      examples: ["x"],
    });
    store.updateField(id, "users", "ssn", { context: undefined, examples: [] });
    field =
      useSynthStudioStore.getState().projects[id].model.entities[0].fields[0];
    expect("context" in field).toBe(false);
    expect("examples" in field).toBe(false);
    expect(field.treatment).toBe("redact");
  });

  it("adds documents with their requirements, replacing a re-upload, and migrates older projects", () => {
    const store = useSynthStudioStore.getState();
    const project = store.createProject({
      name: "loans",
      source: { kind: "document", name: "brd.md" },
    });
    const doc = {
      id: "brd",
      name: "brd.md",
      format: "markdown" as const,
      bytes: 10,
      chars: 10,
      addedAt: "2026-10-29T00:00:00Z",
      addedBy: "user" as const,
      workspacePath: null,
      unreadable: false,
      personalValuesRemoved: 0,
      entities: ["loan"],
      fields: 2,
      rules: 0,
      warnings: [],
    };
    const req = {
      id: "BR-1",
      docId: "brd",
      text: "Each loan ...",
      kind: "data" as const,
      mapped: [],
    };
    store.addDocument(project.id, doc, [req]);
    store.addDocument(project.id, { ...doc, fields: 3 }, [
      req,
      { ...req, id: "BR-2" },
    ]);
    store.setDocumentPaths(project.id, "brd", {
      workspacePath: "synth-input/x/brd.md",
    });
    const after = useSynthStudioStore.getState().projects[project.id];
    expect(after.documents).toHaveLength(1);
    expect(after.documents[0]).toMatchObject({
      fields: 3,
      workspacePath: "synth-input/x/brd.md",
    });
    expect(after.requirements.map((r) => r.id)).toEqual(["BR-1", "BR-2"]);

    const migrate = useSynthStudioStore.persist.getOptions().migrate!;
    const old = { projects: { p: { id: "p" } }, activeProjectId: null };
    const migrated = migrate(old, 1) as {
      projects: Record<
        string,
        { documents: unknown[]; requirements: unknown[] }
      >;
    };
    expect(migrated.projects.p).toMatchObject({
      documents: [],
      requirements: [],
    });
  });
});
