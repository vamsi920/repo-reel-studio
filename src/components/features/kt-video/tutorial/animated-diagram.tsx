import { useMemo } from "react";
import { interpolate, useVideoConfig } from "remotion";
import {
  SEQ_MESSAGE_GAP,
  SEQ_PARTICIPANT_HEIGHT,
  SEQ_TOP,
  revealOrder,
} from "#/lib/kt-video/diagram-layout";
import type {
  DiagramVisual,
  TutorialDiagram,
} from "#/lib/kt-video/tutorial-types";
import { THEME, easeInOut, easeOut, enter } from "./theme";

export const DIAGRAM_WIDTH = 1680;
export const DIAGRAM_HEIGHT = 860;
const PADDING = 60;
const MAX_ZOOM_IN = 2.3;
const REVEAL_STAGGER = 5;
const CAMERA_FRAMES = 26;

interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

function fitCamera(diagram: TutorialDiagram): Camera {
  return {
    x: -PADDING / 2,
    y: -PADDING / 2,
    w: diagram.width + PADDING,
    h: diagram.height + PADDING,
  };
}

function cameraFor(diagram: TutorialDiagram, focusNodes: string[]): Camera {
  const full = fitCamera(diagram);
  if (!focusNodes.length) return full;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  if (diagram.kind === "sequence") {
    const indexes = focusNodes
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n));
    const messages = diagram.messages.filter((m) => indexes.includes(m.index));
    if (!messages.length) return full;
    const participants = new Set(messages.flatMap((m) => [m.from, m.to]));
    for (const n of diagram.nodes) {
      if (!participants.has(n.id)) continue;
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x + n.width);
    }
    for (const m of messages) {
      const y = messageY(m.index);
      minY = Math.min(minY, y - 60);
      maxY = Math.max(maxY, y + 40);
    }
    minY = Math.min(minY, SEQ_TOP);
  } else {
    for (const n of diagram.nodes) {
      if (!focusNodes.includes(n.id)) continue;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
      maxY = Math.max(maxY, n.y + n.height);
    }
  }
  if (!Number.isFinite(minX)) return full;
  // Keep some neighbours in view: expand to at least 55% of the full frame.
  const w = Math.max(maxX - minX + PADDING * 3, full.w * 0.55);
  const h = Math.max(maxY - minY + PADDING * 3, full.h * 0.55);
  const fullScale = Math.min(DIAGRAM_WIDTH / full.w, DIAGRAM_HEIGHT / full.h);
  const scale = Math.min(
    DIAGRAM_WIDTH / w,
    DIAGRAM_HEIGHT / h,
    fullScale * MAX_ZOOM_IN,
  );
  const cw = DIAGRAM_WIDTH / scale;
  const ch = DIAGRAM_HEIGHT / scale;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: Math.max(full.x, Math.min(full.x + full.w - cw, cx - cw / 2)),
    y: Math.max(full.y, Math.min(full.y + full.h - ch, cy - ch / 2)),
    w: cw,
    h: ch,
  };
}

function messageY(index: number): number {
  return SEQ_TOP + SEQ_PARTICIPANT_HEIGHT + 50 + index * SEQ_MESSAGE_GAP;
}

function polyline(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  // Smooth through bend points with quadratic curves.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const p = points[i];
    const next = points[i + 1];
    const mx = (p.x + next.x) / 2;
    const my = (p.y + next.y) / 2;
    d += ` Q ${p.x} ${p.y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function pointAlong(
  points: { x: number; y: number }[],
  t: number,
): { x: number; y: number } {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const segs: number[] = [];
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const len = Math.hypot(
      points[i].x - points[i - 1].x,
      points[i].y - points[i - 1].y,
    );
    segs.push(len);
    total += len;
  }
  let dist = t * total;
  for (let i = 0; i < segs.length; i += 1) {
    if (dist <= segs[i] || i === segs.length - 1) {
      const r = segs[i] === 0 ? 0 : dist / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * r,
        y: points[i].y + (points[i + 1].y - points[i].y) * r,
      };
    }
    dist -= segs[i];
  }
  return points[points.length - 1];
}

function NodeShape({
  node,
  color,
  fill,
  strokeWidth,
}: {
  node: TutorialDiagram["nodes"][number];
  color: string;
  fill: string;
  strokeWidth: number;
}) {
  const { x, y, width: w, height: h, shape } = node;
  const common = { stroke: color, strokeWidth, fill };
  switch (shape) {
    case "round":
      return <rect x={x} y={y} width={w} height={h} rx={h / 2} {...common} />;
    case "circle":
      return (
        <ellipse
          cx={x + w / 2}
          cy={y + h / 2}
          rx={w / 2}
          ry={h / 2}
          {...common}
        />
      );
    case "diamond":
      return (
        <polygon
          points={`${x + w / 2},${y - 8} ${x + w + 14},${y + h / 2} ${x + w / 2},${y + h + 8} ${x - 14},${y + h / 2}`}
          {...common}
        />
      );
    case "hexagon":
      return (
        <polygon
          points={`${x + 12},${y} ${x + w - 12},${y} ${x + w},${y + h / 2} ${x + w - 12},${y + h} ${x + 12},${y + h} ${x},${y + h / 2}`}
          {...common}
        />
      );
    case "cylinder":
      return (
        <g>
          <rect x={x} y={y + 6} width={w} height={h - 12} {...common} />
          <ellipse cx={x + w / 2} cy={y + 6} rx={w / 2} ry={7} {...common} />
          <ellipse
            cx={x + w / 2}
            cy={y + h - 6}
            rx={w / 2}
            ry={7}
            {...common}
          />
        </g>
      );
    default:
      return <rect x={x} y={y} width={w} height={h} rx={10} {...common} />;
  }
}

export interface AnimatedDiagramProps {
  diagram: TutorialDiagram;
  visual: DiagramVisual;
  previous: DiagramVisual | null;
  /** First time this diagram is on screen: draw it in piece by piece. */
  introduce: boolean;
  relativeFrame: number;
}

export function AnimatedDiagram({
  diagram,
  visual,
  previous,
  introduce,
  relativeFrame,
}: AnimatedDiagramProps) {
  const { fps } = useVideoConfig();
  const order = useMemo(() => revealOrder(diagram), [diagram]);
  const target = useMemo(
    () => cameraFor(diagram, visual.focusNodes),
    [diagram, visual.focusNodes],
  );
  const from = useMemo(
    () =>
      previous?.diagramId === diagram.id
        ? cameraFor(diagram, previous.focusNodes)
        : fitCamera(diagram),
    [diagram, previous],
  );
  const introDelay = introduce ? order.length * REVEAL_STAGGER + 10 : 0;
  const camT = easeInOut(relativeFrame, introDelay, introDelay + CAMERA_FRAMES);
  const cam: Camera = {
    x: from.x + (target.x - from.x) * camT,
    y: from.y + (target.y - from.y) * camT,
    w: from.w + (target.w - from.w) * camT,
    h: from.h + (target.h - from.h) * camT,
  };
  const scale = Math.min(DIAGRAM_WIDTH / cam.w, DIAGRAM_HEIGHT / cam.h);
  const offsetX = (DIAGRAM_WIDTH - cam.w * scale) / 2;
  const offsetY = (DIAGRAM_HEIGHT - cam.h * scale) / 2;

  const focus = new Set(visual.focusNodes);
  const hasFocus = focus.size > 0;
  const focusIn = easeOut(relativeFrame, introDelay + 6, introDelay + 22);
  const appear = enter(relativeFrame, fps);
  const flowOffset = -(relativeFrame * 1.6);

  const nodeReveal = (id: string) => {
    if (!introduce) return 1;
    const index = Math.max(0, order.indexOf(id));
    return enter(relativeFrame, fps, 6 + index * REVEAL_STAGGER);
  };

  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));

  return (
    <div
      role="img"
      aria-label={`${diagram.kind} diagram${hasFocus ? `, focusing ${visual.focusNodes.join(", ")}` : ""}`}
      style={{
        width: DIAGRAM_WIDTH,
        height: DIAGRAM_HEIGHT,
        borderRadius: 14,
        overflow: "hidden",
        background: `radial-gradient(ellipse at 50% 40%, #141926 0%, ${THEME.bg} 70%)`,
        border: `1px solid ${THEME.borderStrong}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        opacity: appear,
        position: "relative",
      }}
    >
      <svg
        width={DIAGRAM_WIDTH}
        height={DIAGRAM_HEIGHT}
        style={{ position: "absolute", inset: 0 }}
      >
        <defs>
          <pattern
            id="kt-grid"
            width="32"
            height="32"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 32 0 L 0 0 0 32"
              fill="none"
              stroke="rgba(255,255,255,0.035)"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="kt-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(232,236,241,0.7)" />
          </marker>
          <marker
            id="kt-arrow-hot"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="9"
            markerHeight="9"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={THEME.accent} />
          </marker>
          <filter id="kt-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#kt-grid)" />
        <g
          transform={`translate(${offsetX} ${offsetY}) scale(${scale}) translate(${-cam.x} ${-cam.y})`}
        >
          {diagram.kind === "sequence" ? (
            <SequenceBody
              diagram={diagram}
              focus={focus}
              focusIn={focusIn}
              relativeFrame={relativeFrame}
              fps={fps}
              introduce={introduce}
            />
          ) : (
            <>
              {diagram.groups.map((g) => (
                <g
                  key={g.id}
                  opacity={introduce ? easeOut(relativeFrame, 0, 14) : 1}
                >
                  <rect
                    x={g.x}
                    y={g.y}
                    width={g.width}
                    height={g.height}
                    rx={16}
                    fill="rgba(255,255,255,0.025)"
                    stroke="rgba(255,255,255,0.16)"
                    strokeDasharray="8 6"
                  />
                  <text
                    x={g.x + 18}
                    y={g.y + 30}
                    fill={THEME.textMuted}
                    fontFamily={THEME.fontSans}
                    fontSize={15}
                    fontWeight={700}
                    letterSpacing={1}
                  >
                    {g.label.toUpperCase()}
                  </text>
                </g>
              ))}
              {diagram.edges.map((e) => {
                const a = nodeById.get(e.from);
                const b = nodeById.get(e.to);
                if (!a || !b || e.points.length < 2) return null;
                const hot = hasFocus && (focus.has(e.from) || focus.has(e.to));
                const bothHot =
                  hasFocus && focus.has(e.from) && focus.has(e.to);
                const reveal = Math.min(nodeReveal(e.from), nodeReveal(e.to));
                const draw = introduce
                  ? easeOut(
                      relativeFrame,
                      10 +
                        Math.max(order.indexOf(e.from), order.indexOf(e.to)) *
                          REVEAL_STAGGER,
                      24 +
                        Math.max(order.indexOf(e.from), order.indexOf(e.to)) *
                          REVEAL_STAGGER,
                    )
                  : 1;
                const dim = hasFocus && !hot ? 0.22 + 0.78 * (1 - focusIn) : 1;
                const d = polyline(e.points);
                const mid = pointAlong(e.points, 0.5);
                const dot = hot
                  ? pointAlong(
                      e.points,
                      (((relativeFrame * 0.014) % 1) + 1) % 1,
                    )
                  : null;
                return (
                  <g key={e.id} opacity={reveal * dim}>
                    <path
                      d={d}
                      fill="none"
                      stroke={hot ? THEME.accent : "rgba(232,236,241,0.55)"}
                      strokeWidth={e.style === "thick" ? 4 : hot ? 3 : 2}
                      strokeDasharray={
                        e.style === "dotted" ? "7 7" : hot ? "10 8" : undefined
                      }
                      strokeDashoffset={hot ? flowOffset : 0}
                      pathLength={1}
                      style={{
                        strokeDasharray:
                          e.style === "dotted" || hot ? undefined : `${draw} 1`,
                        strokeDashoffset:
                          e.style === "dotted" || hot ? flowOffset : 0,
                      }}
                      markerEnd={`url(#${hot ? "kt-arrow-hot" : "kt-arrow"})`}
                    />
                    {e.label ? (
                      <g>
                        <rect
                          x={mid.x - e.label.length * 4.2 - 8}
                          y={mid.y - 13}
                          width={e.label.length * 8.4 + 16}
                          height={24}
                          rx={6}
                          fill={THEME.bg}
                          stroke={hot ? THEME.accent : "rgba(255,255,255,0.12)"}
                        />
                        <text
                          x={mid.x}
                          y={mid.y + 4}
                          textAnchor="middle"
                          fill={hot ? THEME.accent : THEME.textMuted}
                          fontFamily={THEME.fontSans}
                          fontSize={13}
                        >
                          {e.label}
                        </text>
                      </g>
                    ) : null}
                    {dot ? (
                      <circle
                        cx={dot.x}
                        cy={dot.y}
                        r={bothHot ? 7 : 5}
                        fill={THEME.accent}
                        filter="url(#kt-glow)"
                      />
                    ) : null}
                  </g>
                );
              })}
              {diagram.nodes.map((n) => {
                const isFocus = focus.has(n.id);
                const reveal = nodeReveal(n.id);
                const dim =
                  hasFocus && !isFocus ? 0.35 + 0.65 * (1 - focusIn) : 1;
                const grow = isFocus ? 1 + 0.05 * focusIn : 1;
                const cx = n.x + n.width / 2;
                const cy = n.y + n.height / 2;
                const labelLines = n.label.split("\n");
                return (
                  <g
                    key={n.id}
                    opacity={reveal * dim}
                    transform={`translate(${cx} ${cy}) scale(${(0.7 + 0.3 * reveal) * grow}) translate(${-cx} ${-cy})`}
                    filter={isFocus ? "url(#kt-glow)" : undefined}
                  >
                    <NodeShape
                      node={n}
                      color={isFocus ? THEME.accent : "rgba(232,236,241,0.5)"}
                      fill={isFocus ? "rgba(34,224,255,0.14)" : THEME.bgPanel}
                      strokeWidth={isFocus ? 2.5 : 1.5}
                    />
                    {labelLines.map((line, i) => (
                      <text
                        key={`${n.id}-${i}`}
                        x={cx}
                        y={cy + (i - (labelLines.length - 1) / 2) * 20 + 5}
                        textAnchor="middle"
                        fill={isFocus ? "#ffffff" : THEME.text}
                        fontFamily={i === 0 ? THEME.fontSans : THEME.fontMono}
                        fontSize={i === 0 ? 15 : 13}
                        fontWeight={i === 0 ? 600 : 400}
                      >
                        {line}
                      </text>
                    ))}
                  </g>
                );
              })}
            </>
          )}
        </g>
      </svg>
      {visual.callout ? (
        <div
          style={{
            position: "absolute",
            left: 28,
            bottom: 24,
            padding: "10px 16px",
            borderRadius: 10,
            background: "rgba(34,224,255,0.12)",
            border: `1px solid ${THEME.accentGlow}`,
            color: "#d7f8ff",
            fontFamily: THEME.fontSans,
            fontSize: 17,
            fontWeight: 600,
            opacity: easeOut(relativeFrame, introDelay + 10, introDelay + 24),
          }}
        >
          {visual.callout}
        </div>
      ) : null}
    </div>
  );
}

function SequenceBody({
  diagram,
  focus,
  focusIn,
  relativeFrame,
  fps,
  introduce,
}: {
  diagram: TutorialDiagram;
  focus: Set<string>;
  focusIn: number;
  relativeFrame: number;
  fps: number;
  introduce: boolean;
}) {
  const nodeById = new Map(diagram.nodes.map((n) => [n.id, n]));
  const focusIndexes = [...focus].map(Number).filter(Number.isFinite);
  const maxFocus = focusIndexes.length ? Math.max(...focusIndexes) : -1;
  const hasFocus = focusIndexes.length > 0;
  const lifelineBottom = messageY(diagram.messages.length) + 20;
  return (
    <>
      {diagram.nodes.map((n, i) => {
        const reveal = introduce ? enter(relativeFrame, fps, i * 4) : 1;
        const involved =
          hasFocus &&
          diagram.messages.some(
            (m) =>
              focusIndexes.includes(m.index) &&
              (m.from === n.id || m.to === n.id),
          );
        const dim = hasFocus && !involved ? 0.4 : 1;
        return (
          <g key={n.id} opacity={reveal * dim}>
            <line
              x1={n.x + n.width / 2}
              y1={n.y + n.height}
              x2={n.x + n.width / 2}
              y2={lifelineBottom}
              stroke="rgba(232,236,241,0.25)"
              strokeDasharray="6 6"
            />
            <rect
              x={n.x}
              y={n.y}
              width={n.width}
              height={n.height}
              rx={10}
              fill={involved ? "rgba(34,224,255,0.14)" : THEME.bgPanel}
              stroke={involved ? THEME.accent : "rgba(232,236,241,0.5)"}
              strokeWidth={involved ? 2.5 : 1.5}
            />
            <text
              x={n.x + n.width / 2}
              y={n.y + n.height / 2 + 5}
              textAnchor="middle"
              fill={THEME.text}
              fontFamily={THEME.fontSans}
              fontSize={15}
              fontWeight={600}
            >
              {n.label.split("\n")[0]}
            </text>
          </g>
        );
      })}
      {diagram.messages.map((m) => {
        const a = nodeById.get(m.from);
        const b = nodeById.get(m.to);
        if (!a || !b) return null;
        const y = messageY(m.index);
        const x1 = a.x + a.width / 2;
        const x2 = b.x + b.width / 2;
        const isFocus = focusIndexes.includes(m.index);
        // Messages after the focused one haven't "happened" yet.
        const future = hasFocus && m.index > maxFocus;
        const visible = future ? 0.12 : hasFocus && !isFocus ? 0.4 : 1;
        const draw = isFocus
          ? easeOut(relativeFrame, 6, 22)
          : introduce
            ? easeOut(relativeFrame, 20 + m.index * 4, 32 + m.index * 4)
            : 1;
        const self = x1 === x2;
        const dir = x2 >= x1 ? 1 : -1;
        const endX = self ? x1 + 60 : x1 + (x2 - x1) * draw;
        const label = m.text;
        return (
          <g key={m.index} opacity={visible}>
            {m.block ? (
              <text
                x={Math.min(x1, x2) - 8}
                y={y - 22}
                textAnchor="end"
                fill={THEME.purple}
                fontFamily={THEME.fontSans}
                fontSize={12}
                fontWeight={700}
              >
                {m.block}
              </text>
            ) : null}
            {self ? (
              <path
                d={`M ${x1} ${y - 14} L ${x1 + 60} ${y - 14} L ${x1 + 60} ${y + 14} L ${x1 + 6} ${y + 14}`}
                fill="none"
                stroke={isFocus ? THEME.accent : "rgba(232,236,241,0.6)"}
                strokeWidth={isFocus ? 3 : 2}
                markerEnd={`url(#${isFocus ? "kt-arrow-hot" : "kt-arrow"})`}
              />
            ) : (
              <line
                x1={x1}
                y1={y}
                x2={endX}
                y2={y}
                stroke={isFocus ? THEME.accent : "rgba(232,236,241,0.6)"}
                strokeWidth={isFocus ? 3 : 2}
                strokeDasharray={m.style === "dotted" ? "8 6" : undefined}
                markerEnd={
                  draw > 0.95
                    ? `url(#${isFocus ? "kt-arrow-hot" : "kt-arrow"})`
                    : undefined
                }
              />
            )}
            <text
              x={(x1 + (self ? x1 + 120 : x2)) / 2}
              y={y - 10}
              textAnchor="middle"
              fill={isFocus ? "#ffffff" : THEME.textMuted}
              fontFamily={THEME.fontSans}
              fontSize={14}
              fontWeight={isFocus ? 600 : 400}
              opacity={draw}
            >
              {label.length > 60 ? `${label.slice(0, 57)}…` : label}
            </text>
            {isFocus ? (
              <circle
                cx={
                  x1 +
                  (self
                    ? 30
                    : (x2 - x1) * ((((relativeFrame * 0.02) % 1) + 1) % 1))
                }
                cy={y}
                r={6}
                fill={THEME.accent}
                filter="url(#kt-glow)"
                opacity={focusIn}
              />
            ) : null}
            <text x={x1 + dir * 0} y={y} fill="none">
              {""}
            </text>
          </g>
        );
      })}
      {/* Nothing else; interpolate keeps the import used for future tuning. */}
      <g opacity={interpolate(0, [0, 1], [1, 1])} />
    </>
  );
}
