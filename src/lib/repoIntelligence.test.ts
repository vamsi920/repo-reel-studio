import { describe, expect, it } from "vitest";

import { buildRepoIntelligence } from "@/lib/repoIntelligence";
import type { GitNexusGraphData } from "@/lib/types";

const fileContents: Record<string, string> = {
  "README.md": "# demo\n\nA demo repository.",
  "package.json": '{ "name": "demo" }',
  "src/main.ts": Array.from({ length: 40 }, (_, i) => `const line${i} = ${i};`).join("\n"),
  "src/server/service.ts": Array.from({ length: 900 }, (_, i) => `export const s${i} = ${i};`).join("\n"),
  "src/utils/format.py": "def format_value(value):\n    return str(value)\n",
  "src/utils/format.test.ts": "it('works', () => {});",
};

const graph: GitNexusGraphData = {
  nodes: [
    { id: "file:src/main.ts", name: "main.ts", kind: "File", filePath: "src/main.ts" },
    {
      id: "sym:bootstrap",
      name: "bootstrap",
      kind: "Function",
      filePath: "src/main.ts",
      complexity: 6,
      docstring: "Boots the application.",
      startLine: 1,
      endLine: 10,
    },
    {
      id: "file:src/server/service.ts",
      name: "service.ts",
      kind: "File",
      filePath: "src/server/service.ts",
    },
    {
      id: "file:src/utils/format.py",
      name: "format.py",
      kind: "File",
      filePath: "src/utils/format.py",
    },
  ],
  edges: [{ source: "file:src/main.ts", target: "file:src/server/service.ts", type: "IMPORTS" }],
  clusters: [
    { id: "cluster-app", label: "App Shell", members: ["file:src/main.ts"] },
    {
      id: "cluster-service",
      label: "Service Layer",
      members: ["file:src/server/service.ts"],
      description: "Server side services",
    },
    { id: "cluster-utils", label: "Utilities", members: ["file:src/utils/format.py"] },
    { id: "cluster-empty", label: "Nothing", members: ["file:does/not/exist.ts"] },
  ],
  processes: [],
  summary: {
    repoName: "demo",
    totalFiles: 6,
    totalSymbols: 1,
    totalEdges: 1,
    languages: { TypeScript: 3, Python: 1 },
    entryPoints: ["src/main.ts"],
    hubFiles: ["src/server/service.ts"],
    architecturePattern: "layered",
    keyTechnologies: ["TypeScript"],
  },
};

const build = () =>
  buildRepoIntelligence("demo", "https://github.com/acme/demo", fileContents, graph);

describe("buildRepoIntelligence", () => {
  it("carries repo identity and stats from the evidence bundle", () => {
    const { intelligence, evidence } = build();

    expect(intelligence.repo_name).toBe("demo");
    expect(intelligence.repo_url).toBe("https://github.com/acme/demo");
    expect(intelligence.architecture_pattern).toBe("layered");
    expect(intelligence.technologies).toContain("TypeScript");
    expect(intelligence.total_files).toBe(evidence.repo_stats?.total_files);
    expect(intelligence.total_source_files).toBe(evidence.repo_stats?.total_source_files);
    expect(intelligence.total_lines).toBeGreaterThan(900);
    expect(intelligence.entry_files).toContain("src/main.ts");
    expect(intelligence.hub_files).toContain("src/server/service.ts");
    expect(() => new Date(intelligence.generated_at).toISOString()).not.toThrow();
  });

  it("builds one module per cluster that resolves to known files", () => {
    const { intelligence } = build();
    const ids = intelligence.modules.map((module) => module.id);

    expect(ids).toContain("cluster-app");
    expect(ids).toContain("cluster-service");
    expect(ids).not.toContain("cluster-empty");
  });

  it("derives technologies, complexity and entry/hub flags per module", () => {
    const { intelligence } = build();
    const app = intelligence.modules.find((module) => module.id === "cluster-app");
    const service = intelligence.modules.find((module) => module.id === "cluster-service");
    const utils = intelligence.modules.find((module) => module.id === "cluster-utils");

    expect(app?.technologies).toEqual(["TypeScript"]);
    expect(app?.is_entry).toBe(true);
    expect(app?.complexity).toBe("low");

    expect(service?.is_hub).toBe(true);
    expect(service?.complexity).toBe("high");
    expect(service?.description).toBe("Server side services");
    expect(service?.representative_file).toBe("src/server/service.ts");

    expect(utils?.technologies).toEqual(["Python"]);
    expect(utils?.description).toContain("Utilities module with 1 files");
  });

  it("proposes a master tutorial plus quick start and deep dive tracks", () => {
    const { intelligence } = build();
    const byId = new Map(intelligence.candidate_tutorials.map((t) => [t.id, t]));

    expect(byId.get("tutorial-master")?.module_ids).toEqual(
      intelligence.modules.map((module) => module.id)
    );
    expect(byId.get("tutorial-quickstart")?.module_ids).toEqual(
      intelligence.modules.filter((module) => module.is_entry).map((module) => module.id)
    );
    expect(byId.get("tutorial-deep-dive")?.module_ids ?? []).toEqual(
      intelligence.modules.filter((module) => module.is_hub && !module.is_entry).map((m) => m.id)
    );
    intelligence.candidate_tutorials.forEach((tutorial) => {
      expect(tutorial.estimated_minutes).toBeGreaterThanOrEqual(2);
    });
  });

  it("reports evidence health counts that match the bundle and knowledge graph", () => {
    const { intelligence, evidence, knowledgeGraph } = build();

    expect(intelligence.evidence_health).toEqual({
      snippet_count: evidence.snippet_catalog.length,
      important_file_count: evidence.important_files.length,
      cluster_count: evidence.cluster_summaries.length,
      process_flow_count: evidence.process_flows.length,
      fact_count: evidence.repo_facts.length,
      reading_path_count: knowledgeGraph.reading_paths.length,
    });
    expect(intelligence.knowledge_graph_summary).toBe(knowledgeGraph.summary);
  });

  it("omits tutorial tracks that have no matching modules", () => {
    const { intelligence } = buildRepoIntelligence(
      "demo",
      "https://github.com/acme/demo",
      { "src/lone.ts": "export const lone = 1;" },
      {
        ...graph,
        clusters: [{ id: "cluster-lone", label: "Lone", members: ["src/lone.ts"] }],
        summary: { ...graph.summary!, entryPoints: [], hubFiles: [] },
      }
    );
    const ids = intelligence.candidate_tutorials.map((tutorial) => tutorial.id);

    expect(ids).toEqual(["tutorial-master"]);
  });

  it("handles an empty repository without throwing", () => {
    const { intelligence } = buildRepoIntelligence("demo", "https://github.com/acme/demo", {}, null);

    expect(intelligence.modules).toEqual([]);
    expect(intelligence.total_files).toBe(0);
    expect(intelligence.candidate_tutorials.map((tutorial) => tutorial.id)).toEqual([
      "tutorial-master",
    ]);
  });
});
