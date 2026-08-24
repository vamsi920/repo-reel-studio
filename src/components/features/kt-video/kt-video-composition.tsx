import {
  AbsoluteFill,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { KtManifest, KtScene } from "#/lib/kt-video/build-manifest";
import { DiagramPanel } from "./diagram-panel";
import { RepoTreePanel } from "./repo-tree-panel";
import { ConceptPanel } from "./concept-panel";

/* eslint-disable i18next/no-literal-string -- Remotion composition chrome */

function getActiveLines(
  scene: KtScene,
  maxLines: number,
): {
  lines: string[];
  firstLineNumber: number;
  highlightStart: number;
  highlightEnd: number;
} {
  const allLines = scene.code.split("\n");
  const [hStart, hEnd] = scene.highlight_lines;
  const windowStart = Math.max(1, hStart - 3);
  const windowEnd = Math.min(allLines.length, windowStart + maxLines - 1);
  const lines = allLines.slice(windowStart - 1, windowEnd);
  return {
    lines,
    firstLineNumber: windowStart,
    highlightStart: hStart,
    highlightEnd: hEnd,
  };
}

function CodePanel({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  const { fps } = useVideoConfig();
  const { lines, firstLineNumber, highlightStart, highlightEnd } =
    getActiveLines(scene, 22);
  // A spring-eased "camera settling onto the highlighted lines" zoom, rather
  // than a flat linear fade — starts slightly zoomed out/down, springs to
  // rest. `spring` is core `remotion`, no new dependency.
  const enterSpring = spring({
    frame: relativeFrame,
    fps,
    config: { damping: 26, mass: 0.6 },
  });
  const exitFrames = 12;
  const exit = interpolate(
    relativeFrame,
    [scene.durationInFrames - exitFrames, scene.durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = 0.94 + enterSpring * 0.06;
  const opacity = Math.min(enterSpring, exit);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 1100,
        borderRadius: 12,
        overflow: "hidden",
        opacity,
        transform: `scale(${scale}) translateY(${(1 - enterSpring) * 20}px)`,
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
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#ff5f57",
          }}
        />
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#febc2e",
          }}
        />
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "#28c840",
          }}
        />
        <span
          style={{
            marginLeft: 10,
            fontFamily: "monospace",
            fontSize: 13,
            color: "rgba(255,255,255,0.65)",
          }}
        >
          {scene.file_path ?? scene.title}
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
        {lines.map((line, i) => {
          const lineNo = firstLineNumber + i;
          const isHighlighted =
            lineNo >= highlightStart && lineNo <= highlightEnd;
          return (
            <div
              key={lineNo}
              style={{
                display: "flex",
                background: isHighlighted
                  ? "rgba(34,224,255,0.10)"
                  : "transparent",
                borderLeft: isHighlighted
                  ? "3px solid #22e0ff"
                  : "3px solid transparent",
                padding: "0 20px",
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
                {lineNo}
              </span>
              <span
                style={{
                  whiteSpace: "pre",
                  color: isHighlighted ? "#e6fbff" : "rgba(230,235,240,0.82)",
                }}
              >
                {line || " "}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NarrationBar({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  const fadeFrames = Math.min(20, Math.floor(scene.durationInFrames * 0.15));
  const opacity = interpolate(
    relativeFrame,
    [
      0,
      fadeFrames,
      scene.durationInFrames - fadeFrames,
      scene.durationInFrames,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 64,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 40px",
        opacity,
      }}
    >
      <div
        style={{
          maxWidth: 980,
          background: "rgba(10,14,19,0.92)",
          border: "1px solid rgba(34,224,255,0.2)",
          borderRadius: 14,
          padding: "16px 26px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
        }}
      >
        <p
          style={{
            margin: 0,
            color: "#f2f7fa",
            fontSize: 18,
            lineHeight: 1.55,
            textAlign: "center",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {scene.narration_text}
        </p>
      </div>
    </div>
  );
}

function SceneBadge({
  index,
  total,
  title,
}: {
  index: number;
  total: number;
  title: string;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 28,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        style={{
          padding: "6px 12px",
          borderRadius: 6,
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.1)",
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(255,255,255,0.7)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {index + 1} / {total}
      </span>
      <span
        style={{
          padding: "8px 20px",
          borderRadius: 999,
          background:
            "linear-gradient(135deg, rgba(34,224,255,0.3), rgba(11,129,183,0.25))",
          border: "1px solid rgba(34,224,255,0.5)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.5px",
          textTransform: "uppercase",
          color: "#bff5ff",
        }}
      >
        {title}
      </span>
    </div>
  );
}

/** Self-contained Remotion composition rendering a deterministic KT manifest. */
export function KtVideoComposition({ manifest }: { manifest: KtManifest }) {
  const frame = useCurrentFrame();

  if (!manifest.scenes.length) {
    return (
      <AbsoluteFill
        style={{
          background: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.6)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Select files to generate a KT video
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{ background: "#0a0a0f", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 30%, rgba(34,224,255,0.10) 0%, transparent 60%)",
        }}
      />
      {manifest.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationInFrames}
        >
          <SceneInner
            scene={scene}
            index={i}
            total={manifest.scenes.length}
            frame={frame - scene.startFrame}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

function ScenePanel({
  scene,
  relativeFrame,
}: {
  scene: KtScene;
  relativeFrame: number;
}) {
  switch (scene.type) {
    case "architecture":
    case "flow":
    case "diagram":
      return <DiagramPanel scene={scene} relativeFrame={relativeFrame} />;
    case "repo-tree":
      return <RepoTreePanel scene={scene} relativeFrame={relativeFrame} />;
    case "concept":
      return <ConceptPanel scene={scene} relativeFrame={relativeFrame} />;
    default:
      return <CodePanel scene={scene} relativeFrame={relativeFrame} />;
  }
}

function SceneInner({
  scene,
  index,
  total,
  frame,
}: {
  scene: KtScene;
  index: number;
  total: number;
  frame: number;
}) {
  return (
    <AbsoluteFill
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "90px 40px 150px",
      }}
    >
      <SceneBadge index={index} total={total} title={scene.title} />
      <ScenePanel scene={scene} relativeFrame={frame} />
      <NarrationBar scene={scene} relativeFrame={frame} />
    </AbsoluteFill>
  );
}
