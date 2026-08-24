import { useEffect, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import type { KtManifest } from "./build-manifest";

/**
 * Reads each scene's real narration text aloud as the video plays, using the
 * browser's built-in speech synthesis — no API key, no backend proxy, so it
 * works the same everywhere this app runs. Speaks a scene once per visit
 * (tracked by scene id), so looping playback doesn't re-trigger the same
 * line mid-sentence. Shared between the conversation-scoped KT Video tab and
 * the Knowledge-page Watch KT flow — both build manifests from the same
 * `build-manifest.ts` module and share the exact `KtScene`/`narration_text`
 * shape, so this needed no changes to work in either place.
 */
export function useSceneNarration(
  manifest: KtManifest,
  playerRef: React.RefObject<PlayerRef | null>,
  enabled: boolean,
) {
  const lastSpokenSceneId = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || !window.speechSynthesis) {
      return undefined;
    }
    const player = playerRef.current;
    if (!player) return undefined;

    const handleFrameUpdate = (event: { detail: { frame: number } }) => {
      const { frame } = event.detail;
      const scene = manifest.scenes.find(
        (s) => frame >= s.startFrame && frame < s.endFrame,
      );
      if (!scene || scene.id === lastSpokenSceneId.current) return;
      lastSpokenSceneId.current = scene.id;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(scene.narration_text);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
    };
  }, [manifest, enabled, playerRef]);

  useEffect(() => {
    if (!enabled && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      lastSpokenSceneId.current = null;
    }
  }, [enabled]);

  useEffect(
    () => () => {
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    },
    [],
  );
}
