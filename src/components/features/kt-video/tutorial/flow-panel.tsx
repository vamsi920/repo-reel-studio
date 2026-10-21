/* eslint-disable i18next/no-literal-string -- Remotion frame chrome */
import { useVideoConfig } from "remotion";
import type { CodeVisual, FlowVisual } from "#/lib/kt-video/tutorial-types";
import { IdePanel } from "./ide-panel";
import { THEME, baseName, easeInOut, enter } from "./theme";

const RAIL_HEIGHT = 96;

export function FlowPanel({
  visual,
  previous,
  files,
  fileTree,
  relativeFrame,
  durationInFrames,
}: {
  visual: FlowVisual;
  previous: FlowVisual | null;
  files: Record<string, string>;
  fileTree: string[];
  relativeFrame: number;
  durationInFrames: number;
}) {
  const { fps } = useVideoConfig();
  const step = visual.steps[visual.activeStep];
  const prevStep = previous ? previous.steps[previous.activeStep] : null;
  const codeVisual: CodeVisual = {
    kind: "code",
    path: step.path,
    startLine: step.startLine,
    endLine: step.endLine,
    symbol: step.symbol,
    callout: step.label ?? visual.callout,
  };
  const prevCode: CodeVisual | null = prevStep
    ? {
        kind: "code",
        path: prevStep.path,
        startLine: prevStep.startLine,
        endLine: prevStep.endLine,
        symbol: prevStep.symbol,
      }
    : null;
  const fromIndex = previous ? previous.activeStep : visual.activeStep;
  const slide = easeInOut(relativeFrame, 0, 18);
  const markerIndex = fromIndex + (visual.activeStep - fromIndex) * slide;
  const stepWidth = Math.min(300, (1680 - 40) / visual.steps.length);

  return (
    <div
      style={{
        width: 1680,
        height: 860,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        role="list"
        aria-label="Call chain"
        style={{
          height: RAIL_HEIGHT,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          borderRadius: 14,
          background: THEME.bgRaised,
          border: `1px solid ${THEME.borderStrong}`,
          position: "relative",
          fontFamily: THEME.fontSans,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 20 + markerIndex * stepWidth + 8,
            top: 10,
            width: stepWidth - 16,
            height: RAIL_HEIGHT - 20,
            borderRadius: 12,
            background: THEME.accentSoft,
            border: `1px solid ${THEME.accentGlow}`,
            boxShadow: `0 0 30px ${THEME.accentGlow}`,
          }}
        />
        {visual.steps.map((s, i) => {
          const active = i === visual.activeStep;
          const done = i < visual.activeStep;
          const t = enter(relativeFrame, fps, i * 3);
          return (
            <div
              key={`${s.path}-${i}`}
              role="listitem"
              aria-current={active ? "step" : undefined}
              style={{
                width: stepWidth,
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "0 16px",
                position: "relative",
                opacity: t,
                color: active
                  ? THEME.text
                  : done
                    ? THEME.textMuted
                    : THEME.textFaint,
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: active
                    ? THEME.accent
                    : done
                      ? THEME.green
                      : "rgba(255,255,255,0.08)",
                  color: active || done ? "#06121a" : THEME.textMuted,
                  fontWeight: 800,
                  fontSize: 15,
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: "block",
                    fontFamily: THEME.fontMono,
                    fontSize: 16,
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.symbol ?? baseName(s.path)}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: 13,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.label ?? baseName(s.path)}
                </span>
              </span>
              {i < visual.steps.length - 1 ? (
                <span
                  style={{
                    position: "absolute",
                    right: -8,
                    color: done || active ? THEME.accent : THEME.textFaint,
                    fontSize: 20,
                  }}
                >
                  →
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      <div
        style={{
          transform: "scale(0.885)",
          transformOrigin: "top left",
          height: 860 - RAIL_HEIGHT - 14,
        }}
      >
        <IdePanel
          visual={codeVisual}
          previous={prevCode}
          files={files}
          fileTree={fileTree}
          openTabs={[
            ...new Set(
              visual.steps.slice(0, visual.activeStep + 1).map((s) => s.path),
            ),
          ]}
          relativeFrame={relativeFrame}
          durationInFrames={durationInFrames}
        />
      </div>
    </div>
  );
}
