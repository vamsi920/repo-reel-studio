import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { PlayerRef } from "@remotion/player";
import type { KtManifest, KtScene } from "#/lib/kt-video/build-manifest";
import { useSceneNarration } from "#/lib/kt-video/use-scene-narration";

type Listener = (event: { detail: { frame: number } }) => void;

/** Minimal stand-in for Remotion's PlayerRef event surface. */
function makePlayer() {
  const listeners = new Map<string, Set<Listener>>();
  let playing = false;
  let frame = 0;
  const emit = (type: string, detail: { frame: number } = { frame }) => {
    listeners.get(type)?.forEach((listener) => listener({ detail }));
  };
  const player = {
    addEventListener: (type: string, listener: Listener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: Listener) => {
      listeners.get(type)?.delete(listener);
    },
    isPlaying: () => playing,
    getCurrentFrame: () => frame,
  } as unknown as PlayerRef;

  return {
    player,
    ref: { current: player } as React.RefObject<PlayerRef | null>,
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
    play: () => {
      playing = true;
      emit("play");
    },
    pause: () => {
      playing = false;
      emit("pause");
    },
    seek: (to: number) => {
      frame = to;
      emit("frameupdate", { frame: to });
    },
  };
}

function makeSynth() {
  const synth = {
    speaking: false,
    paused: false,
    speak: vi.fn((utterance: { text: string }) => {
      synth.speaking = true;
      synth.paused = false;
      spoken.push(utterance.text);
    }),
    cancel: vi.fn(() => {
      synth.speaking = false;
    }),
    pause: vi.fn(() => {
      synth.paused = true;
    }),
    resume: vi.fn(() => {
      synth.paused = false;
    }),
  };
  const spoken: string[] = [];
  return { synth, spoken };
}

function scene(id: number, startFrame: number, endFrame: number): KtScene {
  return {
    id,
    type: "code",
    file_path: `src/file${id}.ts`,
    title: `file${id}`,
    code: "",
    highlight_lines: [1, 1],
    narration_text: `Narration for scene ${id}`,
    sentences: [],
    focus_symbols: [],
    durationInFrames: endFrame - startFrame,
    startFrame,
    endFrame,
  };
}

function manifestOf(...scenes: KtScene[]): KtManifest {
  return {
    repo_name: "repo",
    scenes,
    totalFrames: scenes[scenes.length - 1]?.endFrame ?? 1,
    fps: 30,
    repo_files: [],
  };
}

describe("useSceneNarration", () => {
  let synthState: ReturnType<typeof makeSynth>;

  beforeEach(() => {
    synthState = makeSynth();
    vi.stubGlobal("speechSynthesis", synthState.synth);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        rate = 1;

        constructor(public text: string) {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speaks a scene once as playback enters it", () => {
    const p = makePlayer();
    const manifest = manifestOf(scene(0, 0, 100), scene(1, 100, 200));
    renderHook(() => useSceneNarration(manifest, p.ref, true));

    p.play();
    p.seek(10);
    p.seek(20);
    p.seek(120);

    expect(synthState.spoken).toEqual([
      "Narration for scene 0",
      "Narration for scene 1",
    ]);
  });

  it("pauses the voice with the player and resumes it on play", () => {
    const p = makePlayer();
    const manifest = manifestOf(scene(0, 0, 100));
    renderHook(() => useSceneNarration(manifest, p.ref, true));

    p.play();
    p.seek(10);
    p.pause();
    expect(synthState.synth.pause).toHaveBeenCalledTimes(1);

    p.play();
    expect(synthState.synth.resume).toHaveBeenCalledTimes(1);
    // Same scene, so play resumes the paused sentence rather than restarting it.
    expect(synthState.spoken).toEqual(["Narration for scene 0"]);
  });

  it("stays silent while a paused player is scrubbed, then narrates where it landed", () => {
    const p = makePlayer();
    const manifest = manifestOf(scene(0, 0, 100), scene(1, 100, 200));
    renderHook(() => useSceneNarration(manifest, p.ref, true));

    p.seek(150);
    expect(synthState.spoken).toEqual([]);

    p.play();
    expect(synthState.spoken).toEqual(["Narration for scene 1"]);
  });

  it("drops a paused sentence when play lands on a different scene", () => {
    const p = makePlayer();
    const manifest = manifestOf(scene(0, 0, 100), scene(1, 100, 200));
    renderHook(() => useSceneNarration(manifest, p.ref, true));

    p.play();
    p.seek(10);
    p.pause();
    p.seek(150);
    p.play();

    expect(synthState.spoken).toEqual([
      "Narration for scene 0",
      "Narration for scene 1",
    ]);
    // A paused synthesizer never starts a new utterance, so the swap has to
    // clear the old one and un-pause before speaking.
    expect(synthState.synth.cancel).toHaveBeenCalled();
    expect(synthState.synth.paused).toBe(false);
  });

  it("narrates a new manifest's first scene even when it reuses scene ids", () => {
    const p = makePlayer();
    const first = manifestOf(scene(0, 0, 100));
    const { rerender } = renderHook(
      ({ manifest }) => useSceneNarration(manifest, p.ref, true),
      { initialProps: { manifest: first } },
    );

    p.play();
    p.seek(10);
    expect(synthState.spoken).toEqual(["Narration for scene 0"]);

    const second = manifestOf({
      ...scene(0, 0, 100),
      narration_text: "Narration for the other video",
    });
    rerender({ manifest: second });
    p.seek(20);

    expect(synthState.spoken).toEqual([
      "Narration for scene 0",
      "Narration for the other video",
    ]);
  });

  it("stops speaking and detaches from the player when narration is turned off", () => {
    const p = makePlayer();
    const manifest = manifestOf(scene(0, 0, 100));
    const { rerender } = renderHook(
      ({ enabled }) => useSceneNarration(manifest, p.ref, enabled),
      { initialProps: { enabled: true } },
    );

    p.play();
    p.seek(10);
    expect(p.listenerCount("frameupdate")).toBe(1);

    rerender({ enabled: false });

    expect(synthState.synth.cancel).toHaveBeenCalled();
    expect(p.listenerCount("frameupdate")).toBe(0);
    expect(p.listenerCount("play")).toBe(0);
    expect(p.listenerCount("pause")).toBe(0);
  });
});
