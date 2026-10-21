/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */
import { useVideoConfig } from "remotion";
import type { CardsVisual } from "#/lib/kt-video/tutorial-types";
import { THEME, baseName, enter } from "./theme";

export function RecapCards({
  visual,
  relativeFrame,
}: {
  visual: CardsVisual;
  relativeFrame: number;
}) {
  const { fps } = useVideoConfig();
  const revealCount = visual.revealCount ?? visual.items.length;
  const columns =
    visual.items.length <= 3
      ? visual.items.length
      : Math.ceil(visual.items.length / 2);
  return (
    <div
      role="list"
      aria-label="Key takeaways"
      style={{
        width: 1680,
        height: 860,
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(1, columns)}, 1fr)`,
        gap: 28,
        alignContent: "center",
        padding: "0 60px",
        fontFamily: THEME.fontSans,
      }}
    >
      {visual.items.map((item, i) => {
        const revealed = i < revealCount;
        const t = revealed
          ? enter(relativeFrame, fps, i === revealCount - 1 ? 4 : 0)
          : 0;
        return (
          <div
            key={`${item.title}-${i}`}
            role="listitem"
            style={{
              borderRadius: 16,
              padding: "28px 30px",
              background: revealed
                ? "rgba(255,255,255,0.05)"
                : "rgba(255,255,255,0.02)",
              border: `1px solid ${revealed ? THEME.accentGlow : THEME.border}`,
              boxShadow: revealed ? "0 20px 50px rgba(0,0,0,0.4)" : "none",
              opacity: revealed ? t : 0.25,
              transform: `translateY(${(1 - t) * 18}px) scale(${0.96 + 0.04 * t})`,
              minHeight: 220,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: THEME.accentSoft,
                  color: THEME.accent,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 800,
                  fontSize: 18,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: THEME.text,
                  fontFamily: /^[a-z][A-Za-z0-9_]*$/.test(item.title)
                    ? THEME.fontMono
                    : THEME.fontSans,
                }}
              >
                {item.title}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 20,
                lineHeight: 1.45,
                color: THEME.textMuted,
              }}
            >
              {item.body}
            </p>
            {item.path ? (
              <span
                style={{
                  marginTop: "auto",
                  fontSize: 14,
                  fontFamily: THEME.fontMono,
                  color: THEME.accent,
                  opacity: 0.85,
                }}
              >
                {item.path.includes("/")
                  ? `${item.path.split("/").slice(0, -1).join("/")}/`
                  : ""}
                <strong>{baseName(item.path)}</strong>
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
