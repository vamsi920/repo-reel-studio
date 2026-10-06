import React from "react";
import { getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { laneColor } from "../agent-palette";

export type ParticleFlowEdge = Edge<
  { lane: number; active: boolean },
  "particle"
>;

const PARTICLE_DELAYS = ["0s", "0.55s", "1.1s"];

/**
 * An orthogonal "circuit" wire (right angles with softened corners, like a
 * workflow editor) that draws itself in when born, ends in an arrowhead, and
 * while the step it feeds is still running carries pulses toward it.
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
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    offset: 22,
  });
  const color = laneColor(data?.lane ?? 0);
  const markerId = `tg-arrow-${id}`.replace(/[^A-Za-z0-9_-]/g, "_");

  return (
    <g>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
      <path d={path} className="tg-edge-glow" style={{ stroke: color }} />
      <path
        d={path}
        className="tg-edge-path"
        style={{ stroke: color }}
        markerEnd={`url(#${markerId})`}
      />
      {data?.active &&
        PARTICLE_DELAYS.map((delay) => (
          <circle
            key={delay}
            r={3}
            fill={color}
            stroke="#ffffff"
            strokeWidth={1.25}
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
