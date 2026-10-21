import {
  countWords,
  TUTORIAL_FPS,
  type TutorialAudioClip,
  type TutorialBeat,
  type TutorialChapter,
} from "./tutorial-types";

/** Spoken pace used when no synthesised audio exists to measure. */
export const WORDS_PER_SECOND = 2.45;
/** Breath between beats so visuals never cut mid-thought. */
const BEAT_TAIL_SECONDS = 0.7;
/** How long the lower-third chapter card stays up at every chapter start.
 * It overlays the chapter's first beat rather than delaying it, so the
 * frame is never empty while the voice is already talking. */
export const CHAPTER_LEAD_SECONDS = 1.1;

const MIN_SECONDS_BY_VISUAL: Record<TutorialBeat["visual"]["kind"], number> = {
  title: 4.5,
  code: 4,
  diagram: 4.5,
  tree: 3.5,
  flow: 4,
  cards: 3.5,
};

export function estimateBeatSeconds(
  beat: TutorialBeat,
  clip?: TutorialAudioClip,
): number {
  const spoken = clip
    ? clip.durationSeconds
    : countWords(beat.narration) / WORDS_PER_SECOND;
  return Math.max(
    MIN_SECONDS_BY_VISUAL[beat.visual.kind],
    spoken + BEAT_TAIL_SECONDS,
  );
}

/** Assigns absolute frames to every chapter and beat, in order. */
export function timeTutorial(
  chapters: TutorialChapter[],
  audio: Record<string, TutorialAudioClip> | undefined,
  fps = TUTORIAL_FPS,
): { chapters: TutorialChapter[]; totalFrames: number } {
  let cursor = 0;
  const timed = chapters.map((chapter) => {
    const chapterStart = cursor;
    const beats = chapter.beats.map((beat) => {
      const seconds = estimateBeatSeconds(beat, audio?.[beat.id]);
      const durationInFrames = Math.max(1, Math.round(seconds * fps));
      const timedBeat: TutorialBeat = {
        ...beat,
        startFrame: cursor,
        durationInFrames,
      };
      cursor += durationInFrames;
      return timedBeat;
    });
    return {
      ...chapter,
      beats,
      startFrame: chapterStart,
      durationInFrames: cursor - chapterStart,
    };
  });
  return { chapters: timed, totalFrames: Math.max(1, cursor) };
}
