import { useMemo, useEffect, useState } from "react";
import type { VideoManifest, VideoScene } from "@/lib/geminiDirector";

export type HydratedScene = VideoScene & {
  audioUrl: string;
  durationInFrames: number;
  startFrame: number;
  endFrame: number;
};

export type HydratedManifest = VideoManifest & {
  fps: number;
  totalFrames: number;
  scenes: HydratedScene[];
};

const DEFAULT_FPS = 30;
const WORDS_PER_SECOND = 2.5;
const FALLBACK_DURATION_SECONDS = 4;

const toDurationFrames = (durationSeconds: number, fps: number) =>
  Math.max(1, Math.round(durationSeconds * fps));

const countWords = (text: string | null | undefined) => {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
};

const getSceneDurationSeconds = (scene: VideoScene) => {
  // First check if scene has explicit duration
  const explicitDuration = Number(scene.duration_seconds);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return explicitDuration;
  }

  // Calculate based on word count in narration
  const words = countWords(scene.narration_text);
  if (words > 0) {
    // Average speaking rate is about 150 words per minute (2.5 words/second)
    // Add a small buffer for pauses
    return Math.max(3, Math.ceil(words / WORDS_PER_SECOND) + 1);
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
