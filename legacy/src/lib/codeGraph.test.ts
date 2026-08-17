import { describe, expect, it } from "vitest";

import { getArchitectureNarrative, getGraphHintsForGemini } from "@/lib/codeGraph";
import type { GitNexusGraphData } from "@/lib/types";

const SAMPLE_GRAPH: GitNexusGraphData = {
  nodes: [
    {
      id: "src/core/auth.ts",
      name: "auth.ts",
      kind: "File",
      filePath: "src/core/auth.ts",
      lineCount: 220,
    },
    {
      id: "sym-authenticate",
      name: "authenticateUser",
      kind: "Function",
      filePath: "src/core/auth.ts",
      complexity: 8,
      docstring:
        "This function is basically responsible for checking credentials and returning a session token.",
      codeSnippet: "export async function authenticateUser(email, password) { return token; }",
    },
  ],
  edges: [
    {
      source: "sym-authenticate",
      target: "src/core/auth.ts",
      type: "DEFINED_IN",
    },
  ],
  clusters: [
    {
      id: "cluster-auth",
      label: "Auth",
      members: ["src/core/auth.ts"],
      description:
        "This cluster is basically the entry point for user sign-in and session handling in order to complete login.",
    },
  ],
  processes: [
    {
      id: "proc-login",
      name: "Login flow",
      description:
        "The process is basically responsible for validating credentials and issuing session state.",
      steps: [
        {
          symbolName: "authenticateUser",
          filePath: "src/core/auth.ts",
          stepIndex: 1,
        },
      ],
    },
  ],
  summary: {
    repoName: "reel-studio",
    totalFiles: 10,
    totalSymbols: 30,
    totalEdges: 50,
    languages: { TypeScript: 10 },
    entryPoints: ["src/core/auth.ts"],
    hubFiles: ["src/core/auth.ts"],
    architecturePattern: "Layered",
    keyTechnologies: ["React", "TypeScript"],
    readmeSummary:
      "This repository is basically focused on authentication and video generation in order to make onboarding easy.",
  },
};

describe("codeGraph layman compression boundaries", () => {
  it("preserves file paths and symbols exactly in architecture narrative", () => {
    const narrative = getArchitectureNarrative(SAMPLE_GRAPH);
    expect(narrative).toContain("src/core/auth.ts");
    expect(narrative).toContain("authenticateUser");
  });

  it("compresses prose descriptions while keeping structural context", () => {
    const narrative = getArchitectureNarrative(SAMPLE_GRAPH);
    expect(narrative.toLowerCase()).not.toContain("basically");
    expect(narrative).toContain("=== REPOSITORY OVERVIEW ===");
    expect(narrative).toContain("=== ENTRY POINTS ===");
  });

  it("keeps path/symbol grounding in graph hints output", () => {
    const hints = getGraphHintsForGemini(SAMPLE_GRAPH, {});
    expect(hints).toContain("CODE GRAPH RAG ANALYSIS");
    expect(hints).toContain("src/core/auth.ts");
    expect(hints).toContain("authenticateUser");
  });
});
