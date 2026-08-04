import { describe, expect, it } from "vitest";

import { findNodeById, generateVideoTree, getNodePath, getRecommendedPath } from "@/lib/videoTree";
import type {
  RepoEvidenceBundle,
  RepoIntelligence,
  RepoKnowledgeGraph,
  VideoNodeSpec,
  VideoTree,
  VideoTreeGenerationPlan,
  VideoTreeNode,
} from "@/lib/types";

const intelligence = {
  repo_name: "demo",
  repo_url: "https://github.com/acme/demo",
  generated_at: "2024-01-01T00:00:00.000Z",
  technologies: ["TypeScript"],
  entry_files: ["src/main.ts"],
  hub_files: [],
  total_files: 2,
  total_source_files: 2,
  total_lines: 100,
  languages: { TypeScript: 2 },
  modules: [
    {
      id: "module-entry",
      label: "Entry",
      description: "Entry module",
      file_paths: ["src/main.ts"],
      technologies: ["TypeScript"],
      complexity: "low",
      is_entry: true,
      is_hub: false,
    },
    {
      id: "module-core",
      label: "Core",
      description: "Core module",
      file_paths: ["src/core.ts"],
      technologies: ["TypeScript"],
      complexity: "high",
      is_entry: false,
      is_hub: true,
    },
  ],
  candidate_tutorials: [],
  evidence_health: {
    snippet_count: 0,
    important_file_count: 0,
    cluster_count: 0,
    process_flow_count: 0,
    fact_count: 0,
    reading_path_count: 0,
  },
} as RepoIntelligence;

const spec = (
  title: string,
  overrides: Partial<VideoNodeSpec> = {}
): VideoNodeSpec => ({
  title,
  type: "feature",
  targetDuration: 3,
  modules: ["module-entry"],
  concepts: ["TypeScript"],
  difficulty: "intermediate",
  narrationStyle: "professional",
  ...overrides,
});

const plan = (): VideoTreeGenerationPlan =>
  ({
    id: "plan-1",
    projectId: "demo",
    createdAt: "2024-01-01T00:00:00.000Z",
    intelligence,
    evidence: {} as RepoEvidenceBundle,
    knowledgeGraph: {} as RepoKnowledgeGraph,
    treeStructure: {
      masterVideo: spec("demo - Complete Overview", {
        type: "master",
        targetDuration: 5,
        difficulty: "beginner",
        modules: ["module-entry", "module-core"],
      }),
      categories: [
        {
          name: "Getting Started",
          description: "Entry points",
          order: 0,
          videos: [spec("Entry", { difficulty: "beginner" })],
        },
        {
          name: "Core Features",
          description: "Main functionality",
          order: 1,
          videos: [
            spec("Core", { difficulty: "advanced", targetDuration: 6, modules: ["module-core"] }),
          ],
        },
      ],
      totalEstimatedDuration: 14,
      conceptMap: [],
    },
    dialogueConfig: {
      defaultPersonality: "professional",
      audienceLevel: "intermediate",
      storyArcTemplate: ["hook"],
      transitionPhrases: {},
      emphasizeTerms: [],
    },
    visualConfig: {
      wordCloudEnabled: true,
      neuralGraphEnabled: true,
      particleEffects: true,
      animationIntensity: "high",
      colorPalette: [],
      transitionStyle: "particle",
    },
  }) as VideoTreeGenerationPlan;

describe("generateVideoTree", () => {
  it("builds a master node with one child per category", () => {
    const tree = generateVideoTree(plan(), "https://github.com/acme/demo", "demo");

    expect(tree.root.type).toBe("master");
    expect(tree.root.children.map((child) => child.title)).toEqual([
      "Getting Started",
      "Core Features",
    ]);
    expect(tree.root.children.every((child) => child.type === "category")).toBe(true);
    expect(tree.root.children[1].parentId).toBe(tree.root.id);
    expect(tree.root.children[1].order).toBe(1);
  });

  it("converts target durations to seconds and rolls them up", () => {
    const tree = generateVideoTree(plan(), "https://github.com/acme/demo", "demo");
    const [gettingStarted, coreFeatures] = tree.root.children;

    expect(tree.root.duration).toBe(5 * 60);
    expect(gettingStarted.duration).toBe(3 * 60);
    expect(coreFeatures.duration).toBe(6 * 60);
    // master + 2 categories + 2 category videos
    expect(tree.totalVideos).toBe(5);
    expect(tree.totalDuration).toBe(5 * 60 + 2 * (3 * 60 + 6 * 60));
  });

  it("describes nodes from their module and collects unique tags", () => {
    const tree = generateVideoTree(plan(), "https://github.com/acme/demo", "demo");
    const entryVideo = tree.root.children[0].children[0];

    expect(entryVideo.description).toBe("Entry module");
    expect(entryVideo.tags).toEqual(["TypeScript", "beginner", "feature"]);
    expect(tree.tags).toEqual([
      "TypeScript",
      "beginner",
      "master",
      "getting started",
      "feature",
      "core features",
      "advanced",
    ]);
  });

  it("carries repo metadata onto the tree", () => {
    const tree = generateVideoTree(plan(), "https://github.com/acme/demo", "demo");

    expect(tree.repoUrl).toBe("https://github.com/acme/demo");
    expect(tree.repoName).toBe("demo");
    expect(tree.projectId).toBe("demo");
    expect(tree.concepts).toEqual([]);
  });
});

const node = (
  id: string,
  overrides: Partial<VideoTreeNode> = {}
): VideoTreeNode => ({
  id,
  title: id,
  type: "feature",
  duration: 60,
  children: [],
  tags: [],
  difficulty: "intermediate",
  description: id,
  order: 0,
  ...overrides,
});

const treeFixture = (): VideoTree => {
  const beginnerLeaf = node("leaf-beginner", { difficulty: "beginner" });
  const advancedLeaf = node("leaf-advanced", { difficulty: "advanced" });
  const category = node("category-1", {
    type: "category",
    difficulty: "beginner",
    children: [beginnerLeaf, advancedLeaf],
  });
  const root = node("root", { type: "master", difficulty: "intermediate", children: [category] });

  return {
    id: "tree-1",
    projectId: "demo",
    repoUrl: "https://github.com/acme/demo",
    repoName: "demo",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    root,
    totalDuration: 180,
    totalVideos: 4,
    tags: [],
    concepts: [],
  };
};

describe("findNodeById", () => {
  it("finds the root, a nested node, and returns null when absent", () => {
    const tree = treeFixture();

    expect(findNodeById(tree.root, "root")?.id).toBe("root");
    expect(findNodeById(tree.root, "leaf-advanced")?.id).toBe("leaf-advanced");
    expect(findNodeById(tree.root, "missing")).toBeNull();
  });
});

describe("getNodePath", () => {
  it("returns the ancestor chain down to the node", () => {
    const tree = treeFixture();

    expect(getNodePath(tree.root, "leaf-advanced").map((n) => n.id)).toEqual([
      "root",
      "category-1",
      "leaf-advanced",
    ]);
  });

  it("returns an empty path when the node is missing", () => {
    expect(getNodePath(treeFixture().root, "missing")).toEqual([]);
  });
});

describe("getRecommendedPath", () => {
  it("starts at the root and adds intermediate videos for intermediate users", () => {
    const path = getRecommendedPath(treeFixture(), "intermediate");

    expect(path.map((n) => n.id)).toEqual(["root", "root"]);
  });

  it("adds beginner videos ahead of intermediate ones for beginners", () => {
    const path = getRecommendedPath(treeFixture(), "beginner");

    expect(path.map((n) => n.id)).toEqual(["root", "leaf-beginner", "root"]);
  });

  it("skips category nodes when picking by difficulty", () => {
    const path = getRecommendedPath(treeFixture(), "beginner");

    expect(path.some((n) => n.type === "category")).toBe(false);
  });
});
