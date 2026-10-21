/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */
import { useVideoConfig } from "remotion";
import type {
  KtTutorial,
  TutorialBeat,
  TutorialChapter,
} from "#/lib/kt-video/tutorial-types";
import { CHAPTER_LEAD_SECONDS } from "#/lib/kt-video/tutorial-timing";
import {
  CAPTION_HEIGHT,
  STAGE,
  THEME,
  TOP_BAR_HEIGHT,
  easeOut,
  enter,
} from "./theme";

export function TopBar({
  tutorial,
  chapterIndex,
  frame,
}: {
  tutorial: KtTutorial;
  chapterIndex: number;
  frame: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: TOP_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        padding: "0 40px",
        gap: 24,
        fontFamily: THEME.fontSans,
        color: THEME.textMuted,
        fontSize: 15,
        background:
          "linear-gradient(180deg, rgba(11,13,18,0.95), rgba(11,13,18,0.6))",
      }}
    >
      <span
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          color: THEME.text,
          fontWeight: 700,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 3,
            background: THEME.accent,
            boxShadow: `0 0 12px ${THEME.accentGlow}`,
          }}
        />
        {tutorial.repoName}
      </span>
      <span style={{ color: THEME.textFaint }}>›</span>
      <span>{tutorial.pageTitle}</span>
      <div
        style={{
          marginLeft: "auto",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        {tutorial.chapters.map((chapter, i) => {
          const progress =
            i < chapterIndex
              ? 1
              : i > chapterIndex
                ? 0
                : Math.max(
                    0,
                    Math.min(
                      1,
                      (frame - chapter.startFrame) / chapter.durationInFrames,
                    ),
                  );
          return (
            <div
              key={chapter.id}
              title={chapter.title}
              style={{
                width: Math.max(
                  24,
                  Math.min(90, 900 / tutorial.chapters.length),
                ),
                height: 5,
                borderRadius: 999,
                background: "rgba(255,255,255,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress * 100}%`,
                  height: "100%",
                  background: THEME.accent,
                }}
              />
            </div>
          );
        })}
        <span
          style={{
            marginLeft: 12,
            fontVariantNumeric: "tabular-nums",
            color: THEME.textFaint,
            fontSize: 13,
          }}
        >
          {chapterIndex + 1}/{tutorial.chapters.length}
        </span>
      </div>
    </div>
  );
}

export function ChapterLowerThird({
  chapter,
  index,
  relativeFrame,
}: {
  chapter: TutorialChapter;
  index: number;
  relativeFrame: number;
}) {
  const { fps } = useVideoConfig();
  const inT = enter(relativeFrame, fps);
  const hold = Math.round(CHAPTER_LEAD_SECONDS * fps) + 70;
  const out = 1 - easeOut(relativeFrame, hold, hold + 14);
  return (
    <div
      style={{
        position: "absolute",
        left: 48,
        bottom: CAPTION_HEIGHT + 28,
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        opacity: Math.min(inT, out),
        transform: `translateX(${(1 - inT) * -40}px)`,
        fontFamily: THEME.fontSans,
        zIndex: 10,
      }}
    >
      <div style={{ width: 6, background: THEME.accent, borderRadius: 3 }} />
      <div
        style={{
          padding: "14px 24px 14px 20px",
          background: "rgba(11,13,18,0.9)",
          border: `1px solid ${THEME.border}`,
          borderLeft: "none",
          borderRadius: "0 12px 12px 0",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            letterSpacing: 1.6,
            textTransform: "uppercase",
            color: THEME.accent,
            fontWeight: 700,
          }}
        >
          Chapter {index + 1}
        </div>
        <div
          style={{
            fontSize: 30,
            fontWeight: 800,
            color: THEME.text,
            marginTop: 2,
          }}
        >
          {chapter.title}
        </div>
        {chapter.goal ? (
          <div
            style={{
              fontSize: 16,
              color: THEME.textMuted,
              marginTop: 4,
              maxWidth: 720,
            }}
          >
            {chapter.goal}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Captions({
  beat,
  relativeFrame,
}: {
  beat: TutorialBeat;
  relativeFrame: number;
}) {
  const fadeIn = easeOut(relativeFrame, 0, 8);
  const fadeOut =
    1 -
    easeOut(relativeFrame, beat.durationInFrames - 8, beat.durationInFrames);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: CAPTION_HEIGHT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 200px",
        opacity: Math.min(fadeIn, fadeOut),
        pointerEvents: "none",
      }}
    >
      <p
        style={{
          margin: 0,
          padding: "10px 22px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.72)",
          color: "#ffffff",
          fontFamily: THEME.fontSans,
          fontSize: 24,
          lineHeight: 1.4,
          textAlign: "center",
          maxWidth: STAGE.width - 400,
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
        }}
      >
        {beat.narration}
      </p>
    </div>
  );
}
