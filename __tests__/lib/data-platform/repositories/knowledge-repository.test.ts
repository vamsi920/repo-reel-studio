import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeRepository } from "#/lib/knowledge/knowledge-engine";

interface QueryResult {
  data: unknown;
  error: unknown;
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, QueryResult>,
  // Records every `.eq(column, value)` call, tagged with the table it was
  // issued against, so tests can assert a query was actually scoped by a
  // given column (e.g. `branch`) rather than just checking the final
  // (mock-controlled) result.
  eqCalls: [] as { table: string; column: string; value: unknown }[],
  // Records every `.order(column, options)` call, tagged by table, so tests
  // can assert a query is actually deterministically ordered rather than
  // relying on whatever order the (mock-controlled) result happens to list.
  orderCalls: [] as { table: string; column: string; options: unknown }[],
  // Records every `.upsert(payload, options)` call, tagged by table.
  upsertCalls: [] as { table: string; payload: unknown; options: unknown }[],
  // Records every `.insert(rows)` call, tagged by table.
  insertCalls: [] as { table: string; rows: unknown }[],
}));

function emptyResult(): QueryResult {
  return { data: null, error: null };
}

vi.mock("#/lib/data-platform/client", () => {
  function chain(result: QueryResult, table: string) {
    // Mimics postgrest-js's chainable, thenable query builder: every
    // intermediate call (select/eq/order/limit/in/delete) returns the same
    // chainable object, and it can be awaited directly (reconstruct's
    // per-table queries and saveFullKnowledge's deletes/inserts do this) or
    // terminated with maybeSingle()/single() (getFullGeneration/
    // getLatestGenerationForRepository/saveFullKnowledge's upsert do this).
    const obj: Record<string, unknown> = {};
    for (const method of ["select", "limit", "in", "delete"]) {
      obj[method] = () => obj;
    }
    obj.eq = (column: string, value: unknown) => {
      state.eqCalls.push({ table, column, value });
      return obj;
    };
    obj.order = (column: string, options: unknown) => {
      state.orderCalls.push({ table, column, options });
      return obj;
    };
    obj.upsert = (payload: unknown, options: unknown) => {
      state.upsertCalls.push({ table, payload, options });
      return obj;
    };
    obj.insert = (rows: unknown) => {
      state.insertCalls.push({ table, rows });
      return obj;
    };
    obj.maybeSingle = async () => result;
    obj.single = async () => result;
    obj.then = (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return obj;
  }

  return {
    isSupabaseConfigured: true,
    supabase: {
      from: (table: string) => chain(state.tables[table] ?? emptyResult(), table),
    },
  };
});

const { knowledgePersistenceRepository } =
  await import("#/lib/data-platform/repositories/knowledge-repository");

beforeEach(() => {
  state.eqCalls = [];
  state.orderCalls = [];
  state.upsertCalls = [];
  state.insertCalls = [];
});

const GENERATION_ROW = {
  id: "gen-1",
  commit_sha: "abc1234",
  title: "Repo Wiki",
  summary: "A summary",
  generated_at: "2026-09-01T00:00:00.000Z",
};

describe("knowledgePersistenceRepository.getLatestGenerationForRepository", () => {
  beforeEach(() => {
    state.tables = {
      knowledge_generations: emptyResult(),
      knowledge_sections: { data: [], error: null },
      knowledge_pages: { data: [], error: null },
      knowledge_diagrams: { data: [], error: null },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null without logging when there is legitimately no generation yet", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1", "main"),
    ).resolves.toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine query error (RLS denial, network failure) used to
  // return null identically to "not generated yet", with zero console
  // signal anywhere -- indistinguishable from a real "not generated" repo,
  // which made a repo with real generated knowledge intermittently show
  // "This repository hasn't been generated yet." with nothing pointing at
  // why.
  it("logs and returns null when the generation query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = {
      data: null,
      error: { message: "permission denied for table knowledge_generations" },
    };

    await expect(
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1", "main"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] getLatestGenerationForRepository failed",
      state.tables.knowledge_generations.error,
    );
  });

  // Regression: `repositoryUuid` identifies the repo, not a branch -- a repo
  // with generations for more than one branch used to return whichever
  // branch was generated most recently repo-wide, regardless of which
  // branch the caller actually asked for. Cold-loading `/kt/<repo>@main`
  // could then silently render `release`'s title/sections/pages/commit sha
  // labeled as `main`.
  it("scopes the query to the requested branch, not just the repository", async () => {
    state.tables.knowledge_generations = { data: GENERATION_ROW, error: null };

    await knowledgePersistenceRepository.getLatestGenerationForRepository(
      "repo-1",
      "release",
    );

    expect(state.eqCalls).toContainEqual({
      table: "knowledge_generations",
      column: "branch",
      value: "release",
    });
  });

  // Regression: `knowledge_sections`/`knowledge_pages` have no ORDER BY,
  // so a cold reconstruction could come back in a different order than the
  // one DeepWiki originally emitted and the live session rendered (e.g. a
  // repo's `unsectionedPages` list in kt-repository.tsx, which relies on
  // `knowledge.pages` array order with no independent sort of its own).
  it("orders sections and pages by their persisted position", async () => {
    state.tables.knowledge_generations = { data: GENERATION_ROW, error: null };

    await knowledgePersistenceRepository.getLatestGenerationForRepository(
      "repo-1",
      "main",
    );

    expect(state.orderCalls).toContainEqual({
      table: "knowledge_sections",
      column: "position",
      options: { ascending: true },
    });
    expect(state.orderCalls).toContainEqual({
      table: "knowledge_pages",
      column: "position",
      options: { ascending: true },
    });
  });

  it("returns the reconstructed knowledge when a generation exists", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = { data: GENERATION_ROW, error: null };
    state.tables.knowledge_pages = {
      data: [
        {
          id: "page-1",
          title: "Overview",
          description: "desc",
          content_markdown: "# Overview",
          importance: "high",
          relevant_files: [],
          related_page_ids: [],
          parent_section_id: null,
        },
      ],
      error: null,
    };

    const result =
      await knowledgePersistenceRepository.getLatestGenerationForRepository(
        "repo-1",
        "main",
      );
    expect(result?.commitSha).toBe("abc1234");
    expect(result?.pages).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: reconstruct()'s three parallel sub-queries (sections, pages,
  // diagrams) discarded their `error` entirely -- a real failure on any one
  // of them was invisible, and only the pages query's failure even affected
  // the return value (silently, via `!pageRows`).
  it("logs when a reconstruct sub-query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = { data: GENERATION_ROW, error: null };
    state.tables.knowledge_pages = {
      data: null,
      error: { message: "permission denied for table knowledge_pages" },
    };

    await expect(
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1", "main"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] reconstruct: knowledge_pages failed",
      state.tables.knowledge_pages.error,
    );
  });

  // Regression: a `sectionsError`/`diagramsError` alongside a *successful*
  // `pageRows` query used to fall through the old `!pageRows`-only gate and
  // return a "successful" KnowledgeRepository with `sections: []` / no
  // diagrams -- a generation that genuinely has sections/diagrams rendered
  // with an empty table of contents, indistinguishable from one that really
  // has none.
  it("returns null (not a partial result) when only the sections sub-query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = { data: GENERATION_ROW, error: null };
    state.tables.knowledge_pages = {
      data: [
        {
          id: "page-1",
          title: "Overview",
          description: "desc",
          content_markdown: "# Overview",
          importance: "high",
          relevant_files: [],
          related_page_ids: [],
          parent_section_id: null,
        },
      ],
      error: null,
    };
    state.tables.knowledge_sections = {
      data: null,
      error: { message: "permission denied for table knowledge_sections" },
    };

    await expect(
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1", "main"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] reconstruct: knowledge_sections failed",
      state.tables.knowledge_sections.error,
    );
  });
});

describe("knowledgePersistenceRepository.getFullGeneration", () => {
  beforeEach(() => {
    state.tables = {
      knowledge_generations: emptyResult(),
      knowledge_sections: { data: [], error: null },
      knowledge_pages: { data: [], error: null },
      knowledge_diagrams: { data: [], error: null },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs and returns null when the generation query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = {
      data: null,
      error: { message: "network error" },
    };

    await expect(
      knowledgePersistenceRepository.getFullGeneration("repo-1", "abc1234"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] getFullGeneration failed",
      state.tables.knowledge_generations.error,
    );
  });
});

describe("knowledgePersistenceRepository.listGeneratedRepositories", () => {
  beforeEach(() => {
    state.tables = {
      knowledge_generations: { data: [], error: null },
      repositories: { data: [], error: null },
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an empty, non-error list when there are genuinely no generations", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      knowledgePersistenceRepository.listGeneratedRepositories(),
    ).resolves.toEqual({ summaries: [], error: false });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // Regression: a genuine query error (RLS denial, network failure) used to
  // be indistinguishable from "no generations exist" -- both resolved to an
  // identical empty array, so the /kt list page rendered "nothing generated
  // yet" even when real generations existed and just couldn't be read.
  it("logs and flags an error when the generations query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = {
      data: null,
      error: { message: "permission denied" },
    };

    await expect(
      knowledgePersistenceRepository.listGeneratedRepositories(),
    ).resolves.toEqual({ summaries: [], error: true });
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] listGeneratedRepositories: knowledge_generations failed",
      state.tables.knowledge_generations.error,
    );
  });

  it("logs and flags an error when the repositories query errors", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_generations = {
      data: [{ repository_id: "repo-1", branch: "main" }],
      error: null,
    };
    state.tables.repositories = {
      data: null,
      error: { message: "permission denied" },
    };

    await expect(
      knowledgePersistenceRepository.listGeneratedRepositories(),
    ).resolves.toEqual({ summaries: [], error: true });
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] listGeneratedRepositories: repositories failed",
      state.tables.repositories.error,
    );
  });

  it("returns the resolved summaries with no error when both queries succeed", async () => {
    state.tables.knowledge_generations = {
      data: [{ repository_id: "repo-1", branch: "main" }],
      error: null,
    };
    state.tables.repositories = {
      data: [{ id: "repo-1", owner: "vamsi920", name: "layman" }],
      error: null,
    };

    await expect(
      knowledgePersistenceRepository.listGeneratedRepositories(),
    ).resolves.toEqual({
      summaries: [{ owner: "vamsi920", repo: "layman", branch: "main" }],
      error: false,
    });
  });

  // Regression: generations were deduped down to one row per
  // `repository_id`, keeping only whichever branch had been generated most
  // recently across the whole repo. A repo generated on both `main` and
  // `release` then surfaced only one of them here, so the /kt list page
  // offered "Generate Knowledge" (a real, redundant DeepWiki run) for the
  // other branch even though Supabase already had content for it.
  it("returns one summary per generated branch, not just per repository", async () => {
    state.tables.knowledge_generations = {
      data: [
        { repository_id: "repo-1", branch: "release" },
        { repository_id: "repo-1", branch: "main" },
      ],
      error: null,
    };
    state.tables.repositories = {
      data: [{ id: "repo-1", owner: "vamsi920", name: "layman" }],
      error: null,
    };

    await expect(
      knowledgePersistenceRepository.listGeneratedRepositories(),
    ).resolves.toEqual({
      summaries: [
        { owner: "vamsi920", repo: "layman", branch: "release" },
        { owner: "vamsi920", repo: "layman", branch: "main" },
      ],
      error: false,
    });
  });
});

describe("knowledgePersistenceRepository.saveFullKnowledge", () => {
  const KNOWLEDGE: KnowledgeRepository = {
    repositoryId: "repo-1",
    commitSha: "abc1234",
    title: "Repo Wiki",
    summary: "A summary",
    sections: [
      { id: "sec-b", title: "Second", pageIds: ["page-b"] },
      { id: "sec-a", title: "First", pageIds: ["page-a"] },
    ],
    pages: [
      {
        id: "page-b",
        title: "Page B",
        description: "",
        contentMarkdown: "# B",
        importance: "medium",
        relevantFiles: [],
        diagrams: [],
        relatedPageIds: [],
      },
      {
        id: "page-a",
        title: "Page A",
        description: "",
        contentMarkdown: "# A",
        importance: "high",
        relevantFiles: [],
        diagrams: [],
        relatedPageIds: [],
      },
    ],
    generatedAt: "2026-09-23T00:00:00.000Z",
  };

  beforeEach(() => {
    state.tables = {
      knowledge_generations: { data: { id: "gen-1" }, error: null },
      knowledge_sections: emptyResult(),
      knowledge_pages: emptyResult(),
      knowledge_diagrams: emptyResult(),
    };
  });

  // Regression: two branches can share a commit sha (a branch just cut from
  // another, or a fast-forward merge). The upsert used to target only
  // (repository_id, commit_sha), so generating a second branch at the same
  // commit collided with the first branch's row and silently overwrote its
  // title/sections/pages/diagrams with the second branch's content, all
  // still labeled with the first branch's own generation.
  it("targets the branch-aware unique constraint on upsert conflict", async () => {
    await knowledgePersistenceRepository.saveFullKnowledge(
      "repo-1",
      "workspace-1",
      "main",
      KNOWLEDGE,
    );

    expect(state.upsertCalls).toContainEqual(
      expect.objectContaining({
        table: "knowledge_generations",
        options: { onConflict: "repository_id,branch,commit_sha" },
      }),
    );
  });

  // Regression: `knowledge_sections`/`knowledge_pages` rows carried no
  // ordinal, so a cold reconstruction could come back in a different order
  // than the one originally generated and rendered live.
  it("stamps each section and page row with its array index as position", async () => {
    await knowledgePersistenceRepository.saveFullKnowledge(
      "repo-1",
      "workspace-1",
      "main",
      KNOWLEDGE,
    );

    const sectionsInsert = state.insertCalls.find(
      (call) => call.table === "knowledge_sections",
    );
    const pagesInsert = state.insertCalls.find(
      (call) => call.table === "knowledge_pages",
    );

    expect(sectionsInsert?.rows).toEqual([
      expect.objectContaining({ id: "sec-b", position: 0 }),
      expect.objectContaining({ id: "sec-a", position: 1 }),
    ]);
    expect(pagesInsert?.rows).toEqual([
      expect.objectContaining({ id: "page-b", position: 0 }),
      expect.objectContaining({ id: "page-a", position: 1 }),
    ]);
  });

  // Regression: supabase-js resolves `{data, error}` rather than throwing, so
  // a delete failing (RLS timing/network blip) went completely unnoticed --
  // the code proceeded straight to inserting the fresh rows regardless,
  // leaving old rows from the previous generation (e.g. stale diagrams)
  // sitting alongside the new ones with nothing to catch or log it.
  it("logs and aborts the write when a delete step fails, without inserting anything", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    state.tables.knowledge_diagrams = {
      data: null,
      error: new Error("delete denied"),
    };

    await knowledgePersistenceRepository.saveFullKnowledge(
      "repo-1",
      "workspace-1",
      "main",
      KNOWLEDGE,
    );

    expect(state.insertCalls).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("delete knowledge_diagrams"),
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});
