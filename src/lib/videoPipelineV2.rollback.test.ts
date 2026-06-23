import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    GEMINI_API_KEY: "test-key",
  };
});

import { clearLaymanCompressionInstrumentation, getLaymanCompressionInstrumentationReport } from "@/lib/laymanCompressionPolicy";
import { __videoPipelineV2GeminiRollbackTestables } from "@/lib/videoPipelineV2";

afterEach(() => {
  clearLaymanCompressionInstrumentation();
  vi.restoreAllMocks();
});

describe("videoPipelineV2 layman rollback retry", () => {
  it("retries once with original prompt when schema parse fails", async () => {
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const promptText: string = body?.contents?.[0]?.parts?.[0]?.text || "";

      const callIndex = fetchSpy.mock.calls.length;
      if (callIndex === 1) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "not json at all" }] } }],
          }),
          text: async () => "",
          status: 200,
        } as any;
      }

      // Second call should be rollback prompt (uncompressed goal present verbatim)
      expect(promptText).toContain("Scene goal: ORIGINAL GOAL WITH FILLER WORDS PLEASE KINDLY ACTUALLY");

      return {
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: "Ok",
                      claim: "Ok",
                      sentences: [{ text: "Sentence one.", evidence_indexes: [0], on_screen_focus: ["x"] }],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        text: async () => "",
        status: 200,
      } as any;
    });

    // @ts-expect-error test override
    globalThis.fetch = fetchSpy;

    const scene: any = {
      id: 1,
      phase: "deep_dive",
      type: "feature",
      title: "Test scene",
      sceneGoal: "ORIGINAL GOAL WITH FILLER WORDS PLEASE KINDLY ACTUALLY",
      filePath: "src/test.ts",
      lineRange: [1, 10],
      visualKind: "code",
      claim: "Please kindly actually explain the thing in a very clear way.",
      evidenceRefs: [
        {
          file_path: "src/test.ts",
          start_line: 1,
          end_line: 3,
          reason: "test",
          symbol_name: "x",
        },
      ],
      onScreenFocus: ["x"],
      bulletPoints: ["a"],
      focusSymbols: ["x"],
      durationSeconds: 10,
      generationKind: "master",
      moduleTitle: undefined,
      narrationWordTarget: [90, 150],
    };

    const result = await __videoPipelineV2GeminiRollbackTestables.writeScene("repo", scene, {
      "src/test.ts": "export const x = 1;",
    });

    expect(result.sentences?.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const report = getLaymanCompressionInstrumentationReport();
    expect(report.totalEvents).toBeGreaterThanOrEqual(1);
    expect(report.byContext.video_prose_context.skipped).toBeGreaterThanOrEqual(1);
  });
});

