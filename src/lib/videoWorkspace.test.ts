import { describe, expect, it } from "vitest";

import { resetLaymanCompressionPolicy } from "@/lib/laymanCompressionPolicy";
import { discoverRepoVideoModules } from "@/lib/videoWorkspace";
import type { GitNexusGraphData } from "@/lib/types";

const fakeGraphData = (): GitNexusGraphData =>
  ({
    nodes: [
      { id: "n1", name: "Auth", kind: "File", filePath: "src/auth/guard.ts" },
      { id: "n2", name: "Session", kind: "File", filePath: "src/auth/session.ts" },
      { id: "n3", name: "API", kind: "File", filePath: "src/api/client.ts" },
    ],
    edges: [
      { source: "n1", target: "n2", type: "IMPORTS" },
      { source: "n2", target: "n3", type: "IMPORTS" },
    ],
    clusters: [
      { id: "cluster-auth", label: "auth core", members: ["n1", "n2"] },
    ],
    processes: [],
    summary: {
      repoName: "demo-repo",
      totalFiles: 3,
      totalSymbols: 3,
      totalEdges: 2,
      languages: { TypeScript: 3 },
      entryPoints: ["src/auth/guard.ts"],
      hubFiles: ["src/auth/session.ts"],
      architecturePattern: "layered",
    },
    codegraph: {
      engine: "xnuinside-codegraph",
      generatedAt: new Date().toISOString(),
      graph: { nodes: [], links: [], unlinkedModules: [] },
      moduleIndex: [
        {
          id: "m-auth-guard",
          label: "auth guard",
          fullPath: "src/auth/guard.ts",
          entityCount: 8,
          incomingLinks: 10,
          outgoingLinks: 12,
          lines: 220,
          dependencies: ["src/auth/session.ts", "src/api/client.ts"],
          dependents: ["src/routes/login.ts"],
          topEntities: [
            {
              id: "e-validateToken",
              name: "validateToken",
              entityType: "function",
              lines: 35,
              startLine: 20,
              endLine: 55,
              linksIn: 8,
              linksOut: 7,
            },
          ],
        },
        {
          id: "m-auth-session",
          label: "auth session",
          fullPath: "src/auth/session.ts",
          entityCount: 6,
          incomingLinks: 7,
          outgoingLinks: 6,
          lines: 180,
          dependencies: ["src/api/client.ts"],
          dependents: ["src/auth/guard.ts"],
          topEntities: [
            {
              id: "e-buildSession",
              name: "buildSession",
              entityType: "function",
              lines: 24,
              startLine: 10,
              endLine: 34,
              linksIn: 4,
              linksOut: 3,
            },
          ],
        },
      ],
      entityIndex: [],
      csvRows: [],
      stats: {
        pythonFileCount: 0,
        moduleCount: 2,
        entityCount: 14,
        externalCount: 0,
        linkCount: 20,
        unlinkedModuleCount: 0,
      },
      summary: {
        mostConnectedModules: [],
        hottestEntities: [],
        externalDependencies: [],
      },
    },
  }) as GitNexusGraphData;

describe("videoWorkspace module discovery layman integration", () => {
  it("preserves identifiers, file/import paths, and ranking anchors", () => {
    resetLaymanCompressionPolicy();
    const catalog = discoverRepoVideoModules("demo-repo", fakeGraphData(), null);
    expect(catalog).toBeTruthy();
    const modules = catalog?.modules ?? [];
    expect(modules.length).toBeGreaterThan(0);

    const top = modules[0];
    expect(top.id).toContain("cluster-auth");
    expect(top.representative_file).toBe("src/auth/guard.ts");
    expect(top.file_paths).toEqual(expect.arrayContaining(["src/auth/guard.ts", "src/auth/session.ts"]));
    expect(top.related_file_paths).toEqual(expect.arrayContaining(["src/api/client.ts", "src/routes/login.ts"]));
    expect(top.top_entities).toContain("validateToken");
    expect(top.entity_count).toBe(14);
    expect(top.incoming_links).toBe(17);
    expect(top.outgoing_links).toBe(18);
  });
});

