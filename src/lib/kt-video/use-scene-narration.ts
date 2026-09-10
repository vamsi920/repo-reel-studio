import { useEffect, useRef } from "react";
import type { PlayerRef } from "@remotion/player";
import type { KtManifest, KtScene } from "./build-manifest";

/**
 * Reads each scene's real narration text aloud as the video plays, using the
 * browser's built-in speech synthesis — no API key, no backend proxy, so it
 * works the same everywhere this app runs. Speaks a scene once per visit
 * (tracked by scene id), so looping playback doesn't re-trigger the same
 * line mid-sentence. Follows the player's transport: pausing the video
 * pauses the voice mid-sentence and play resumes it, scrubbing a paused
 * player stays silent, and a new manifest starts its own narration from
 * scratch. Shared between the conversation-scoped KT Video tab and the
 * Knowledge-page Watch KT flow — both build manifests from the same
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
    const synth = window.speechSynthesis;

    // A different manifest is a different video: whatever the previous one
    // had already said must not mute the new one's first scene.
    lastSpokenSceneId.current = null;

    const sceneAt = (frame: number): KtScene | undefined =>
      manifest.scenes.find((s) => frame >= s.startFrame && frame < s.endFrame);

    const speak = (scene: KtScene) => {
      lastSpokenSceneId.current = scene.id;
      synth.cancel();
      // `cancel()` empties the queue but leaves a paused synthesizer paused,
      // and a paused synthesizer never starts a new utterance.
      if (synth.paused) synth.resume();
      const utterance = new SpeechSynthesisUtterance(scene.narration_text);
      utterance.rate = 1.05;
      synth.speak(utterance);
    };

    const speakFrame = (frame: number) => {
      const scene = sceneAt(frame);
      if (!scene || scene.id === lastSpokenSceneId.current) return;
      speak(scene);
    };

    const handleFrameUpdate = (event: { detail: { frame: number } }) => {
      // Scrubbing a paused player fires frameupdate too; the voice stays
      // quiet until play, which then narrates wherever the scrub landed.
      if (!player.isPlaying()) return;
      speakFrame(event.detail.frame);
    };

    const handlePlay = () => {
      const scene = sceneAt(player.getCurrentFrame());
      if (scene && scene.id !== lastSpokenSceneId.current) {
        speak(scene);
        return;
      }
      if (synth.paused) synth.resume();
    };

    const handlePause = () => {
      if (synth.speaking) synth.pause();
    };

    player.addEventListener("frameupdate", handleFrameUpdate);
    player.addEventListener("play", handlePlay);
    player.addEventListener("pause", handlePause);
    return () => {
      player.removeEventListener("frameupdate", handleFrameUpdate);
      player.removeEventListener("play", handlePlay);
      player.removeEventListener("pause", handlePause);
      // Detaching (manifest swap, narration off, unmount) also stops the
      // sentence that belonged to the detached manifest.
      synth.cancel();
    };
  }, [manifest, enabled, playerRef]);

  useEffect(() => {
    if (!enabled && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      lastSpokenSceneId.current = null;
    }
  }, [enabled]);
}
