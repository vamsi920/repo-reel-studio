import React from "react";
import { getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { laneColor } from "../agent-palette";

export type ParticleFlowEdge = Edge<
  { lane: number; active: boolean },
  "particle"
>;

const PARTICLE_DELAYS = ["0s", "0.55s", "1.1s"];

/**
 * A glowing bezier that draws itself in when born and, while the step it
 * feeds is still running, carries little sparks of light toward it.
 */
function ParticleEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<ParticleFlowEdge>) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.35,
  });
  const color = laneColor(data?.lane ?? 0);
  const gradientId = `tg-grad-${id}`.replace(/[^A-Za-z0-9_-]/g, "_");

  return (
    <g>
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={sourceX}
          y1={sourceY}
          x2={targetX}
          y2={targetY}
        >
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={1} />
        </linearGradient>
      </defs>
      <path d={path} className="tg-edge-glow" style={{ stroke: color }} />
      <path
        d={path}
        className="tg-edge-path"
        style={{ stroke: `url(#${gradientId})` }}
      />
      {data?.active &&
        PARTICLE_DELAYS.map((delay) => (
          <circle
            key={delay}
            r={3.5}
            fill="#fff"
            className="tg-particle"
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          >
            <animateMotion
              dur="1.6s"
              begin={delay}
              repeatCount="indefinite"
              path={path}
            />
          </circle>
        ))}
    </g>
  );
}

export const ParticleEdge = React.memo(ParticleEdgeImpl);
