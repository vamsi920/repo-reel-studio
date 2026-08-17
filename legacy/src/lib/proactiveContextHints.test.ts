import { describe, expect, it } from "vitest";

import {
  buildProactiveContextHints,
  normalizeContextPath,
  serializeProactiveContextHints,
} from "@/lib/proactiveContextHints";

describe("proactiveContextHints", () => {
  it("normalizes absolute and local paths", () => {
    expect(normalizeContextPath("/Users/dev/repo-reel-studio/src/lib/db.ts")).toBe("src/lib/db.ts");
    expect(normalizeContextPath("local://src/foo.ts")).toBe("src/foo.ts");
    expect(normalizeContextPath("../secret")).toBeNull();
  });

  it("builds manifest + graph hints with caps", () => {
    const hints = buildProactiveContextHints(
      {
        scenes: [{ file_path: "/abs/src/a.ts" }, { file_path: "src/b.ts" }],
        evidence_bundle: {
          important_files: ["src/b.ts"],
          hub_files: ["/abs/server/hub.py"],
          entry_candidates: ["src/entry.tsx"],
          snippet_catalog: [{}, {}, {}],
          repo_stats: { key_technologies: ["React", "React"] },
        },
        knowledge_graph: { summary: { architecture: "SPA" } },
      },
      {
        summary: {
          hubFiles: ["server/other.py"],
          entryPoints: ["src/entry.tsx"],
          keyTechnologies: ["Vite"],
          architecturePattern: "ignored when manifest has architecture",
        },
      },
    );

    expect(hints.focusFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(hints.hubFiles).toEqual(["server/hub.py", "server/other.py"]);
    expect(hints.entryFiles).toEqual(["src/entry.tsx"]);
    expect(hints.technologies).toEqual(["React", "Vite"]);
    expect(hints.architecture).toBe("SPA");
    expect(hints.evidenceCount).toBe(3);
    expect(hints.snippetCount).toBe(3);
  });

  it("serializes dispatch contract shape", () => {
    const serialized = serializeProactiveContextHints({
      focusFiles: ["/Users/dev/repo/src/x.ts", "../bad"],
      hubFiles: [],
      entryFiles: [],
      technologies: ["TS"],
      architecture: "  monolith  ",
      evidenceCount: "12",
      snippetCount: 11,
    });

    expect(serialized).toEqual({
      focusFiles: ["src/x.ts"],
      hubFiles: [],
      entryFiles: [],
      technologies: ["TS"],
      architecture: "monolith",
      evidenceCount: 12,
      snippetCount: 11,
    });
  });
});
