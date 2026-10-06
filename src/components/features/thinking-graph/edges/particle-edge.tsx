import React from "react";
import { getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { laneColor } from "../agent-palette";

export type ParticleFlowEdge = Edge<
  { lane: number; active: boolean },
  "particle"
>;

const PARTICLE_DELAYS = ["0s", "0.55s", "1.1s"];

/**
 * A solid bezier that draws itself in when born and, while the step it
 * feeds is still running, carries little sparks of light toward it.
 */
function ParticleEdgeImpl({
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

  return (
    <g>
      <path d={path} className="tg-edge-glow" style={{ stroke: color }} />
      <path d={path} className="tg-edge-path" style={{ stroke: color }} />
      {data?.active &&
        PARTICLE_DELAYS.map((delay) => (
          <circle
            key={delay}
            r={3.5}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.5}
            className="tg-particle"
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
