import { useMemo, useEffect, useState } from "react";
import type {
  SentenceEvidence,
  SourceRef,
  VideoManifest,
  VideoScene,
} from "@/lib/types";

export type HydratedSentenceEvidence = SentenceEvidence & {
  startFrame: number;
  endFrame: number;
};

export type HydratedScene = VideoScene & {
  audioUrl: string;
  durationInFrames: number;
  startFrame: number;
  endFrame: number;
  sentence_blocks: HydratedSentenceEvidence[];
};

export type HydratedManifest = VideoManifest & {
  fps: number;
  totalFrames: number;
  scenes: HydratedScene[];
};

const DEFAULT_FPS = 30;
const WORDS_PER_SECOND = 2.3;
const FALLBACK_DURATION_SECONDS = 8;

const toDurationFrames = (durationSeconds: number, fps: number) =>
  Math.max(1, Math.round(durationSeconds * fps));

const countWords = (text: string | null | undefined) => {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
};

const splitIntoSentences = (text: string) =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const buildFallbackSourceRef = (scene: VideoScene): SourceRef | null => {
  const [start, end] = scene.highlight_lines || [1, 1];
  if (!scene.file_path) return null;
  return {
    file_path: scene.file_path,
    start_line: start || 1,
    end_line: Math.max(start || 1, end || start || 1),
  };
};

const buildSentenceBlocks = (
  scene: VideoScene,
  durationInFrames: number
): HydratedSentenceEvidence[] => {
  const fallbackRef = buildFallbackSourceRef(scene);
  const rawSentences =
    scene.sentence_evidence?.length
      ? scene.sentence_evidence
      : splitIntoSentences(scene.narration_text || "").map((sentence) => ({
          sentence,
          source_refs: scene.source_refs?.length
            ? scene.source_refs
            : fallbackRef
              ? [fallbackRef]
              : [],
          visual_kind: scene.visual_kind || scene.visual_type,
          on_screen_focus: scene.on_screen_focus,
        }));

  const usableSentences = rawSentences.filter(
    (sentence) => sentence.sentence && sentence.source_refs?.length
  );

  if (!usableSentences.length) {
    return [];
  }

  const totalWords = Math.max(
    usableSentences.reduce((sum, sentence) => sum + countWords(sentence.sentence), 0),
    usableSentences.length
  );

  let cursor = 0;
  return usableSentences.map((sentence, index) => {
    const sentenceWords = Math.max(1, countWords(sentence.sentence));
    const remainingSentences = usableSentences.length - index;
    const remainingFrames = Math.max(1, durationInFrames - cursor);
    const allocatedFrames =
      index === usableSentences.length - 1
        ? remainingFrames
        : Math.max(
            12,
            Math.round((sentenceWords / totalWords) * durationInFrames)
          );
    const safeFrames = Math.min(remainingFrames, allocatedFrames);
    const startFrame = cursor;
    const endFrame = Math.min(durationInFrames, startFrame + safeFrames);
    cursor = endFrame;

    return {
      ...sentence,
      startFrame,
      endFrame,
    };
  });
};

const getSceneDurationSeconds = (scene: VideoScene) => {
  // Calculate required duration based on word count in narration
  const words = countWords(scene.narration_text);
  // Speaking rate 2.3 words/second + 3s buffer for pauses/transitions
  const speechDuration = words > 0
    ? Math.ceil(words / WORDS_PER_SECOND) + 3
    : 0;

  // Check if scene has explicit duration
  const explicitDuration = Number(scene.duration_seconds);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    // Always use the LONGER of explicit vs speech-based duration
    // This ensures narration is never cut short
    return Math.max(explicitDuration, speechDuration);
  }

  if (speechDuration > 0) {
    return Math.max(FALLBACK_DURATION_SECONDS, speechDuration);
  }

  return FALLBACK_DURATION_SECONDS;
};

/**
 * Hook to hydrate a VideoManifest with computed timing information
 * @param manifest - The raw video manifest
 * @param fps - Frames per second (default 30)
 * @param audioUrls - Optional map of scene IDs to audio URLs (from TTS)
 */
export const useHydrateManifest = (
  manifest: VideoManifest | null | undefined,
  fps: number = DEFAULT_FPS,
  audioUrls?: Map<number, string>
): HydratedManifest | null => {
  return useMemo(() => {
    if (!manifest) return null;

    let cursor = 0;
    const sourceScenes = Array.isArray(manifest.scenes) ? manifest.scenes : [];

    const scenes: HydratedScene[] = sourceScenes.map((scene, index) => {
      const durationSeconds = getSceneDurationSeconds(scene);
      const durationInFrames = toDurationFrames(durationSeconds, fps);
      const startFrame = cursor;
      const endFrame = startFrame + durationInFrames;
      cursor = endFrame;

      // Use provided audio URL if available, otherwise use placeholder
      const audioUrl = audioUrls?.get(scene.id) || '';

      return {
        ...scene,
        audioUrl,
        durationInFrames,
        startFrame,
        endFrame,
        sentence_blocks: buildSentenceBlocks(scene, durationInFrames),
      };
    });

    return {
      ...manifest,
      fps,
      totalFrames: cursor,
      scenes,
    };
  }, [manifest, fps, audioUrls]);
};

/**
 * Hook that combines manifest hydration with optional TTS audio generation
 * Use this when you want to automatically generate audio for scenes
 */
export const useHydrateManifestWithTTS = (
  manifest: VideoManifest | null | undefined,
  fps: number = DEFAULT_FPS,
  enableTTS: boolean = false
) => {
  const [audioUrls, setAudioUrls] = useState<Map<number, string>>(new Map());
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [audioProgress, setAudioProgress] = useState({ completed: 0, total: 0 });

  // Generate TTS audio when enabled and manifest is available
  useEffect(() => {
    if (!enableTTS || !manifest?.scenes?.length) {
      return;
    }

    const generateAudio = async () => {
      setIsGeneratingAudio(true);
      setAudioProgress({ completed: 0, total: manifest.scenes.length });

      try {
        // Dynamic import to avoid loading TTS code when not needed
        const { generateAllSceneAudio } = await import('@/lib/googleTTS');

        const { audioUrls: urls } = await generateAllSceneAudio(
          manifest.scenes,
          undefined,
          (completed, total) => {
            setAudioProgress({ completed, total });
          }
        );

        setAudioUrls(urls);
      } catch (error) {
        console.error('Failed to generate TTS audio:', error);
      } finally {
        setIsGeneratingAudio(false);
      }
    };

    generateAudio();
  }, [manifest, enableTTS]);

  const hydratedManifest = useHydrateManifest(manifest, fps, audioUrls);

  return {
    manifest: hydratedManifest,
    isGeneratingAudio,
    audioProgress,
  };
};
