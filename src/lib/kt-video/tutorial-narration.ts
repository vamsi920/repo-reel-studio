import type { KtManifest } from "./build-manifest";
import { tutorialBeats, type KtTutorial } from "./tutorial-types";

/**
 * Adapts a tutorial to the scene shape `useSceneNarration` reads (id,
 * frame range, narration text), so the browser-voice fallback keeps working
 * for tutorials that have no synthesised audio.
 */
export function narrationManifestFromTutorial(
  tutorial: KtTutorial,
): KtManifest {
  const scenes = tutorialBeats(tutorial).map((beat, index) => ({
    id: index,
    type: "code" as const,
    file_path: beat.visual.kind === "code" ? beat.visual.path : null,
    title: beat.id,
    code: "",
    highlight_lines: [1, 1] as [number, number],
    narration_text: beat.narration,
    sentences: [],
    focus_symbols: [],
    durationInFrames: beat.durationInFrames,
    startFrame: beat.startFrame,
    endFrame: beat.startFrame + beat.durationInFrames,
  }));
  return {
    repo_name: tutorial.repoName,
    scenes,
    totalFrames: tutorial.totalFrames,
    fps: tutorial.fps,
    repo_files: tutorial.fileTree,
  };
}
