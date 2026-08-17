import { describe, expect, it } from "vitest";

import { __videoPipelineV2PromptTestables } from "@/lib/videoPipelineV2";

type PromptScene = Parameters<
  typeof __videoPipelineV2PromptTestables.buildSceneWriterPrompt
>[1];

describe("videoPipelineV2 scene prompt format", () => {
  const scene = {
    id: 7,
    phase: "deep_dive",
    type: "feature",
    title: "Auth flow walkthrough",
    sceneGoal: "Explain how request auth is validated before protected handlers run.",
    filePath: "src/auth/guard.ts",
    lineRange: [20, 88],
    visualKind: "code",
    claim: "The guard enforces token checks before route logic executes.",
    evidenceRefs: [
      {
        file_path: "src/auth/guard.ts",
        start_line: 20,
        end_line: 88,
        reason: "Main auth gate",
        symbol_name: "validateToken",
      },
    ],
    onScreenFocus: ["validateToken", "auth middleware"],
    bulletPoints: ["validate token", "reject invalid sessions"],
    focusSymbols: ["validateToken"],
    durationSeconds: 36,
    generationKind: "master",
    moduleTitle: undefined,
    narrationWordTarget: [120, 210],
  } satisfies PromptScene;

  it("keeps scene writer schema and evidence JSON parseable", () => {
    const prompt = __videoPipelineV2PromptTestables.buildSceneWriterPrompt("demo-repo", scene, [
      {
        index: 0,
        ref: scene.evidenceRefs[0],
        excerpt: "if (!token) throw new Error('missing token')",
      },
    ]);

    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain('"sentences": [');
    expect(prompt).toContain("Video profile context:");

    const evidenceJson = prompt.split("Scene evidence:\n")[1];
    expect(evidenceJson).toBeTruthy();
    const evidence = JSON.parse(evidenceJson);
    expect(Array.isArray(evidence)).toBe(true);
    expect(evidence[0].file_path).toBe("src/auth/guard.ts");
    expect(evidence[0].start_line).toBe(20);
    expect(evidence[0].end_line).toBe(88);
  });

  it("keeps script editor draft payload JSON parseable", () => {
    const prompt = __videoPipelineV2PromptTestables.buildScriptEditorPrompt("demo-repo", scene, {
      title: "Auth flow walkthrough",
      claim: "Guard checks token validity before protected handlers.",
      sentences: [
        {
          text: "Requests pass through the guard before any secure endpoint logic runs.",
          evidence_indexes: [0],
          on_screen_focus: ["validateToken"],
        },
      ],
    });

    expect(prompt).toContain("Return JSON only.");
    expect(prompt).toContain("Current draft:");
    expect(prompt).toContain("Video profile context:");

    const draftJson = prompt.split("Current draft:\n")[1];
    expect(draftJson).toBeTruthy();
    const draft = JSON.parse(draftJson);
    expect(draft.sentences).toHaveLength(1);
    expect(draft.sentences[0].evidence_indexes).toEqual([0]);
  });

  it("keeps high-risk scene goal and claim text exact", () => {
    const exactScene: PromptScene = {
      ...scene,
      sceneGoal: "Keep EXACT phrase: do not rewrite this goal sentence.",
      claim: "Keep EXACT claim text: auth guard enforces token expiry checks.",
    };
    const prompt = __videoPipelineV2PromptTestables.buildSceneWriterPrompt("demo-repo", exactScene, [
      {
        index: 0,
        ref: exactScene.evidenceRefs[0],
        excerpt: "if (token.exp <= now) throw new Error('expired')",
      },
    ]);

    expect(prompt).toContain("Scene goal: Keep EXACT phrase: do not rewrite this goal sentence.");
    expect(prompt).toContain("Claim: Keep EXACT claim text: auth guard enforces token expiry checks.");
  });
});
