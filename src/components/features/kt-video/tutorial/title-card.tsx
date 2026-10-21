import { useVideoConfig } from "remotion";
import type { TitleVisual } from "#/lib/kt-video/tutorial-types";
import { THEME, easeOut, enter } from "./theme";

export function TitleCard({
  visual,
  relativeFrame,
  durationInFrames,
  repoName,
  chapterIndex,
}: {
  visual: TitleVisual;
  relativeFrame: number;
  durationInFrames: number;
  repoName: string;
  chapterIndex: number;
}) {
  const { fps } = useVideoConfig();
  const headingIn = enter(relativeFrame, fps, 4);
  const subIn = enter(relativeFrame, fps, 14);
  const bullets = visual.bullets ?? [];
  // Bullets land spread across the first 70% of the beat so each one
  // arrives roughly as the narration reaches it.
  const bulletWindow = Math.max(20, durationInFrames * 0.7);
  const bulletDelay = (i: number) =>
    24 + (bulletWindow / (bullets.length + 1)) * (i + 1);
  const words = visual.heading.split(" ");

  return (
    <div
      role="group"
      aria-label={visual.heading}
      style={{
        width: 1680,
        height: 860,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 140px",
        position: "relative",
        fontFamily: THEME.fontSans,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(900px 500px at 20% 60%, rgba(34,224,255,0.12), transparent 70%), radial-gradient(700px 400px at 85% 20%, rgba(180,140,255,0.12), transparent 70%)",
          borderRadius: 14,
        }}
      />
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 16px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${THEME.border}`,
            color: THEME.textMuted,
            fontSize: 16,
            letterSpacing: 1,
            textTransform: "uppercase",
            opacity: 0.5 + 0.5 * easeOut(relativeFrame, 0, 12),
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: THEME.accent,
            }}
          />
          {chapterIndex === 0 ? `${repoName} · Code walkthrough` : repoName}
        </div>
        <h1
          style={{
            margin: "28px 0 0",
            fontSize: visual.heading.length > 40 ? 64 : 84,
            lineHeight: 1.05,
            fontWeight: 800,
            color: THEME.text,
            letterSpacing: -1.5,
            maxWidth: 1300,
          }}
        >
          {words.map((word, i) => {
            const t = enter(relativeFrame, fps, i * 2);
            return (
              <span
                key={`${word}-${i}`}
                style={{
                  display: "inline-block",
                  marginRight: 18,
                  opacity: t,
                  transform: `translateY(${(1 - t) * 24}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </h1>
        {visual.subtitle ? (
          <p
            style={{
              margin: "22px 0 0",
              fontSize: 30,
              color: THEME.textMuted,
              maxWidth: 1200,
              lineHeight: 1.35,
              opacity: subIn,
              transform: `translateY(${(1 - subIn) * 12}px)`,
            }}
          >
            {visual.subtitle}
          </p>
        ) : null}
        {bullets.length ? (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "44px 0 0",
              display: "grid",
              gap: 18,
            }}
          >
            {bullets.map((bullet, i) => {
              const t = enter(relativeFrame, fps, bulletDelay(i));
              return (
                <li
                  key={bullet}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 18,
                    fontSize: 28,
                    color: THEME.text,
                    opacity: t,
                    transform: `translateX(${(1 - t) * -24}px)`,
                  }}
                >
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: THEME.accentSoft,
                      border: `1px solid ${THEME.accentGlow}`,
                      color: THEME.accent,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </span>
                  {bullet}
                </li>
              );
            })}
          </ul>
        ) : null}
        <div style={{ opacity: headingIn, height: 0 }} />
      </div>
    </div>
  );
}
