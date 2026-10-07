// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  fetchLatestKnowledge,
  parseRemote,
} from "../../scripts/export-kt-docs.mjs";

type Rows = Record<string, Record<string, unknown>[]>;

/** Minimal PostgREST-shaped fake: equality/in filters, awaitable queries. */
function fakeClient(tables: Rows) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        in: (column: string, values: unknown[]) => {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        order: () => query,
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: rows, error: null }),
      };
      return query;
    },
  };
}

describe("export-kt-docs", () => {
  it("parses https and ssh remotes", () => {
    expect(parseRemote("https://github.com/acme/shop.git")).toEqual({
      owner: "acme",
      repo: "shop",
    });
    expect(parseRemote("git@github.com:acme/shop.git\n")).toEqual({
      owner: "acme",
      repo: "shop",
    });
  });

  it("rebuilds the newest generation across duplicate repository rows", async () => {
    const client = fakeClient({
      repositories: [
        { id: "r1", owner: "acme", name: "shop" },
        { id: "r2", owner: "acme", name: "shop" },
      ],
      knowledge_generations: [
        {
          id: "g-old",
          repository_id: "r1",
          branch: "main",
          commit_sha: "old",
          generated_at: "2026-01-01",
        },
        {
          id: "g-new",
          repository_id: "r2",
          branch: "main",
          commit_sha: "new",
          generated_at: "2026-02-01",
        },
      ],
      knowledge_sections: [
        { generation_id: "g-new", id: "s1", title: "Core", page_ids: ["p1"] },
      ],
      knowledge_pages: [
        {
          generation_id: "g-new",
          id: "p1",
          title: "Payments",
          content_markdown: "body",
        },
        { generation_id: "g-old", id: "p0", title: "Stale" },
      ],
      knowledge_diagrams: [
        {
          page_generation_id: "g-new",
          page_id: "p1",
          id: "d1",
          type: "flow",
          mermaid: "graph TD",
        },
      ],
    });

    const knowledge = await fetchLatestKnowledge(client, {
      owner: "acme",
      repo: "shop",
      branch: "main",
    });

    expect(knowledge?.commitSha).toBe("new");
    expect(
      knowledge?.pages.map((page: { title: string }) => page.title),
    ).toEqual(["Payments"]);
    expect(knowledge?.pages[0].diagrams).toHaveLength(1);
  });

  it("returns null when the repository has no generation for the branch", async () => {
    const client = fakeClient({
      repositories: [{ id: "r1", owner: "acme", name: "shop" }],
      knowledge_generations: [
        {
          id: "g1",
          repository_id: "r1",
          branch: "develop",
          generated_at: "2026-01-01",
        },
      ],
    });

    expect(
      await fetchLatestKnowledge(client, {
        owner: "acme",
        repo: "shop",
        branch: "main",
      }),
    ).toBeNull();
  });
});
