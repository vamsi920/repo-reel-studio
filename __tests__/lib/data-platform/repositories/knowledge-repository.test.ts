import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface QueryResult {
  data: unknown;
  error: unknown;
}

const state = vi.hoisted(() => ({
  tables: {} as Record<string, QueryResult>,
}));

function emptyResult(): QueryResult {
  return { data: null, error: null };
}

vi.mock("#/lib/data-platform/client", () => {
  function chain(result: QueryResult) {
    // Mimics postgrest-js's chainable, thenable query builder: every
    // intermediate call (select/eq/order/limit/in) returns the same
    // chainable object, and it can be awaited directly (reconstruct's
    // per-table queries do this) or terminated with maybeSingle()/single()
    // (getFullGeneration/getLatestGenerationForRepository do this).
    const obj: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "limit", "in"]) {
      obj[method] = () => obj;
    }
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
      from: (table: string) => chain(state.tables[table] ?? emptyResult()),
    },
  };
});

const { knowledgePersistenceRepository } =
  await import("#/lib/data-platform/repositories/knowledge-repository");

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
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1"),
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
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1"),
    ).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      "[knowledge-repository] getLatestGenerationForRepository failed",
      state.tables.knowledge_generations.error,
    );
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
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1"),
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
      knowledgePersistenceRepository.getLatestGenerationForRepository("repo-1"),
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
});
