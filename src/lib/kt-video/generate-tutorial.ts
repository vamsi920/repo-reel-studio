/**
 * Orchestrates one KT tutorial: real files → region index → parsed and
 * laid-out diagrams → script (LLM, or deterministic fallback) → timing →
 * narration audio. Pure with respect to React; `kt-page.tsx` drives it and
 * renders progress.
 */
import { buildRegionIndex } from "./code-regions";
import { layoutDiagram } from "./diagram-layout";
import { parseMermaid } from "./mermaid-parse";
import {
  buildDeterministicScript,
  generateScript,
  type ChatFn,
  type GeneratedScript,
  type ScriptContext,
} from "./tutorial-script";
import { timeTutorial } from "./tutorial-timing";
import {
  TUTORIAL_FPS,
  tutorialBeats,
  type FlowStep,
  type KtTutorial,
  type TutorialDiagram,
} from "./tutorial-types";
import { isTtsAvailable, synthesizeBeats } from "./tts";

export interface TutorialProgress {
  stage: "diagrams" | "planning" | "writing" | "narrating" | "done";
  completed?: number;
  total?: number;
}

export interface BuildTutorialInput {
  repoName: string;
  commitSha: string;
  page: {
    title: string;
    description: string;
    contentMarkdown: string;
    diagrams: { id: string; mermaid: string }[];
  };
  repoSummary?: string;
  siblingPageTitles?: string[];
  files: Record<string, string>;
  conceptHops?: FlowStep[];
  /** `null` when no LLM is reachable: the deterministic script is used. */
  chat: ChatFn | null;
  /** Default: synthesise when a TTS key is configured. */
  narrate?: boolean;
  /** A previously generated script to reuse instead of calling the LLM. */
  script?: GeneratedScript | null;
  /** Fires as soon as the script exists, before narration is synthesised. */
  onScript?: (script: GeneratedScript) => void;
}

export async function buildTutorialDiagrams(
  diagrams: { id: string; mermaid: string }[],
): Promise<Record<string, TutorialDiagram>> {
  const out: Record<string, TutorialDiagram> = {};
  for (const [index, diagram] of diagrams.entries()) {
    const parsed = parseMermaid(diagram.mermaid);
    if (!parsed) continue;
    const id = `d${index}`;
    try {
      out[id] = await layoutDiagram(id, parsed, diagram.mermaid);
    } catch {
      // An unlayoutable diagram is skipped rather than drawn wrong.
    }
  }
  return out;
}

export async function buildTutorial(
  input: BuildTutorialInput,
  onProgress?: (progress: TutorialProgress) => void,
): Promise<KtTutorial> {
  onProgress?.({ stage: "diagrams" });
  const files = Object.fromEntries(
    Object.entries(input.files).filter(
      ([, content]) => content.trim().length > 0,
    ),
  );
  const regions = buildRegionIndex(files);
  const diagrams = await buildTutorialDiagrams(input.page.diagrams);

  const ctx: ScriptContext = {
    repoName: input.repoName,
    pageTitle: input.page.title,
    pageDescription: input.page.description,
    pageMarkdown: input.page.contentMarkdown,
    repoSummary: input.repoSummary,
    siblingPageTitles: input.siblingPageTitles,
    files,
    fileTree: Object.keys(files).sort(),
    regions,
    diagrams,
    conceptHops: input.conceptHops,
  };

  let script: GeneratedScript;
  if (input.script) {
    script = input.script;
  } else if (input.chat) {
    try {
      script = await generateScript(ctx, input.chat, (p) =>
        onProgress?.({
          stage: p.stage,
          completed: p.completed,
          total: p.total,
        }),
      );
    } catch {
      script = buildDeterministicScript(ctx);
    }
  } else {
    script = buildDeterministicScript(ctx);
  }

  input.onScript?.(script);
  const untimed = timeTutorial(script.chapters, undefined);
  let audio: KtTutorial["audio"];
  const shouldNarrate = input.narrate ?? isTtsAvailable();
  if (shouldNarrate && isTtsAvailable()) {
    const beats = untimed.chapters.flatMap((c) => c.beats);
    onProgress?.({ stage: "narrating", completed: 0, total: beats.length });
    const result = await synthesizeBeats(beats, (completed, total) =>
      onProgress?.({ stage: "narrating", completed, total }),
    );
    if (Object.keys(result.clips).length > 0) audio = result.clips;
  }

  const timed = timeTutorial(script.chapters, audio);
  onProgress?.({ stage: "done" });

  const tutorial: KtTutorial = {
    version: 2,
    repoName: input.repoName,
    pageTitle: input.page.title,
    commitSha: input.commitSha,
    fps: TUTORIAL_FPS,
    files,
    fileTree: ctx.fileTree,
    diagrams,
    chapters: timed.chapters,
    totalFrames: timed.totalFrames,
    audio,
    scriptSource: script.source,
    wordCount: script.wordCount,
  };
  return tutorial;
}

export function tutorialDurationSeconds(tutorial: KtTutorial): number {
  return tutorial.totalFrames / tutorial.fps;
}

export function tutorialBeatCount(tutorial: KtTutorial): number {
  return tutorialBeats(tutorial).length;
}
