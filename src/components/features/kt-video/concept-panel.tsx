import { interpolate, spring, useVideoConfig } from "remotion";
import type { KtScene } from "#/lib/kt-video/build-manifest";

function baseName(path: string): string {
  return path.split("/").pop() || path;
}

/** Renders a real multi-file call-chain walkthrough ("concept" scenes) —
 * cycles through `scene.segments` (each a real file/line-range/symbol from a
 * CodeGraph-detected edge) over the scene's duration, with a breadcrumb
 * showing progress through the chain. */
export function ConceptPanel({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  const { fps } = useVideoConfig();
  const segments = scene.segments ?? [];
  if (segments.length === 0) return null;

  const perSegmentFrames = Math.max(
    1,
    Math.floor(scene.durationInFrames / segments.length),
  );
  const activeIndex = Math.min(
    segments.length - 1,
    Math.floor(relativeFrame / perSegmentFrames),
  );
  const active = segments[activeIndex];
  const frameWithinSegment = relativeFrame - activeIndex * perSegmentFrames;

  const enterSpring = spring({
    frame: frameWithinSegment,
    fps,
    config: { damping: 26, mass: 0.6 },
  });
  const exitFrames = 10;
  const exit = interpolate(
    frameWithinSegment,
    [perSegmentFrames - exitFrames, perSegmentFrames],
    [1, 0.4],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const opacity = Math.min(enterSpring, exit === 0.4 ? 1 : exit);

  const lines = active.code.split("\n");

  return (
    <div style={{ width: "100%", maxWidth: 1100 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {segments.map((seg, i) => (
          <div
            key={`${seg.file_path}-${i}`}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            {i > 0 ? (
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                →
              </span>
            ) : null}
            <span
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                fontSize: 12,
                fontFamily: "monospace",
                background:
                  i === activeIndex
                    ? "rgba(34,224,255,0.22)"
                    : "rgba(255,255,255,0.06)",
                border:
                  i === activeIndex
                    ? "1px solid rgba(34,224,255,0.6)"
                    : "1px solid rgba(255,255,255,0.1)",
                color: i === activeIndex ? "#bff5ff" : "rgba(255,255,255,0.45)",
              }}
            >
              {seg.symbol ?? baseName(seg.file_path)}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          borderRadius: 12,
          overflow: "hidden",
          opacity,
          transform: `scale(${0.94 + enterSpring * 0.06})`,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
          border: "1px solid rgba(34,224,255,0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 16px",
            background: "#12161c",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              color: "rgba(255,255,255,0.65)",
            }}
          >
            {active.file_path}:{active.start_line}-{active.end_line}
          </span>
        </div>
        <div
          style={{
            background: "#0b0e13",
            padding: "16px 0",
            fontFamily: "'IBM Plex Mono', Menlo, monospace",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                padding: "0 20px",
                background: "rgba(34,224,255,0.06)",
                borderLeft: "3px solid #22e0ff",
              }}
            >
              <span
                style={{
                  width: 36,
                  color: "rgba(255,255,255,0.28)",
                  userSelect: "none",
                  flexShrink: 0,
                  textAlign: "right",
                  marginRight: 16,
                }}
              >
                {active.start_line + i}
              </span>
              <span style={{ whiteSpace: "pre", color: "#e6fbff" }}>
                {line || " "}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
