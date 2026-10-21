/**
 * Turns a parsed Mermaid diagram into a positioned `TutorialDiagram`.
 * Flowcharts and class diagrams go through ELK's layered algorithm (the
 * same engine CodeGraph uses); sequence diagrams use a fixed lifeline grid.
 * Runs once at tutorial-build time so the Remotion composition only ever
 * reads coordinates.
 */
// eslint-disable-next-line import-x/extensions -- elkjs only ships the bundled build under this exact path
import ELK from "elkjs/lib/elk.bundled.js";
import type { ParsedDiagram } from "./mermaid-parse";
import type {
  DiagramEdge,
  DiagramGroup,
  DiagramNode,
  TutorialDiagram,
} from "./tutorial-types";

export const DIAGRAM_FONT_PX = 17;
const CHAR_WIDTH = DIAGRAM_FONT_PX * 0.58;
const LINE_HEIGHT = DIAGRAM_FONT_PX * 1.35;
const NODE_PAD_X = 28;
const NODE_PAD_Y = 18;
const MIN_NODE_WIDTH = 96;

export const SEQ_PARTICIPANT_WIDTH = 170;
export const SEQ_PARTICIPANT_HEIGHT = 54;
export const SEQ_PARTICIPANT_GAP = 90;
export const SEQ_MESSAGE_GAP = 64;
export const SEQ_TOP = 40;

export function measureLabel(label: string): { width: number; height: number } {
  const lines = label.split("\n");
  const longest = Math.max(...lines.map((l) => l.length), 1);
  return {
    width: Math.max(
      MIN_NODE_WIDTH,
      Math.ceil(longest * CHAR_WIDTH) + NODE_PAD_X * 2,
    ),
    height: Math.ceil(lines.length * LINE_HEIGHT) + NODE_PAD_Y * 2,
  };
}

interface ElkPoint {
  x: number;
  y: number;
}
interface ElkSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}
interface ElkOutNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  children?: ElkOutNode[];
  edges?: ElkOutEdge[];
}
interface ElkOutEdge {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ElkSection[];
}

let elkInstance: InstanceType<typeof ELK> | null = null;
function elk() {
  if (!elkInstance) elkInstance = new ELK();
  return elkInstance;
}

function layoutSequence(
  id: string,
  parsed: ParsedDiagram,
  mermaid: string,
): TutorialDiagram {
  const nodes: DiagramNode[] = parsed.nodes.map((n, i) => ({
    ...n,
    x: 20 + i * (SEQ_PARTICIPANT_WIDTH + SEQ_PARTICIPANT_GAP),
    y: SEQ_TOP,
    width: SEQ_PARTICIPANT_WIDTH,
    height: SEQ_PARTICIPANT_HEIGHT,
  }));
  const width =
    40 +
    nodes.length * SEQ_PARTICIPANT_WIDTH +
    (nodes.length - 1) * SEQ_PARTICIPANT_GAP;
  const height =
    SEQ_TOP +
    SEQ_PARTICIPANT_HEIGHT +
    30 +
    parsed.messages.length * SEQ_MESSAGE_GAP +
    60;
  return {
    id,
    kind: "sequence",
    direction: "RIGHT",
    mermaid,
    nodes,
    edges: [],
    groups: [],
    messages: parsed.messages,
    width,
    height,
  };
}

export async function layoutGraph(
  id: string,
  parsed: ParsedDiagram,
  mermaid: string,
): Promise<TutorialDiagram> {
  const groupIds = new Set(parsed.groups.map((g) => g.id));
  const childrenOf = (group: string | undefined) =>
    parsed.nodes
      .filter(
        (n) =>
          (n.group && groupIds.has(n.group) ? n.group : undefined) === group,
      )
      .map((n) => ({ id: n.id, ...measureLabel(n.label) }));

  const children: Record<string, unknown>[] = [
    ...childrenOf(undefined),
    ...parsed.groups.map((g) => ({
      id: `group:${g.id}`,
      layoutOptions: {
        "elk.padding": "[top=48,left=24,right=24,bottom=24]",
        "elk.direction": parsed.direction,
      },
      children: childrenOf(g.id),
    })),
  ];

  const graph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": parsed.direction,
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.edgeNode": "32",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.edgeRouting": "SPLINES",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding": "[top=24,left=24,right=24,bottom=24]",
    },
    children,
    edges: parsed.edges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  };

  const out = (await elk().layout(graph as never)) as unknown as ElkOutNode;

  const nodes: DiagramNode[] = [];
  const groups: DiagramGroup[] = [];
  const absolute = new Map<string, { x: number; y: number }>();

  const walk = (node: ElkOutNode, ox: number, oy: number) => {
    for (const child of node.children ?? []) {
      const x = ox + (child.x ?? 0);
      const y = oy + (child.y ?? 0);
      absolute.set(child.id, { x, y });
      if (child.id.startsWith("group:")) {
        const gid = child.id.slice("group:".length);
        const source = parsed.groups.find((g) => g.id === gid);
        groups.push({
          id: gid,
          label: source?.label ?? gid,
          x,
          y,
          width: child.width ?? 0,
          height: child.height ?? 0,
        });
        walk(child, x, y);
      } else {
        const source = parsed.nodes.find((n) => n.id === child.id);
        if (source) {
          nodes.push({
            ...source,
            x,
            y,
            width: child.width ?? MIN_NODE_WIDTH,
            height: child.height ?? 40,
          });
        }
      }
    }
  };
  walk(out, 0, 0);

  // ELK reports edge sections relative to the edge's container (root or a
  // group); hierarchyHandling=INCLUDE_CHILDREN keeps them on the root.
  const collectEdges = (
    node: ElkOutNode,
    ox: number,
    oy: number,
    acc: ElkOutEdge[],
  ) => {
    for (const e of node.edges ?? []) {
      acc.push({
        ...e,
        sections: e.sections?.map((s) => ({
          startPoint: { x: s.startPoint.x + ox, y: s.startPoint.y + oy },
          endPoint: { x: s.endPoint.x + ox, y: s.endPoint.y + oy },
          bendPoints: s.bendPoints?.map((p) => ({ x: p.x + ox, y: p.y + oy })),
        })),
      });
    }
    for (const child of node.children ?? []) {
      if (child.id.startsWith("group:")) {
        const pos = absolute.get(child.id) ?? { x: 0, y: 0 };
        collectEdges(child, pos.x, pos.y, acc);
      }
    }
    return acc;
  };
  const laidEdges = collectEdges(out, 0, 0, []);

  const edges: DiagramEdge[] = parsed.edges.map((e) => {
    const laid = laidEdges.find((l) => l.id === e.id);
    const section = laid?.sections?.[0];
    let points: { x: number; y: number }[];
    if (section) {
      points = [
        section.startPoint,
        ...(section.bendPoints ?? []),
        section.endPoint,
      ];
    } else {
      const a = nodes.find((n) => n.id === e.from);
      const b = nodes.find((n) => n.id === e.to);
      points =
        a && b
          ? [
              { x: a.x + a.width / 2, y: a.y + a.height / 2 },
              { x: b.x + b.width / 2, y: b.y + b.height / 2 },
            ]
          : [];
    }
    return { ...e, points };
  });

  return {
    id,
    kind: parsed.kind,
    direction: parsed.direction,
    mermaid,
    nodes,
    edges,
    groups,
    messages: [],
    width: out.width ?? Math.max(...nodes.map((n) => n.x + n.width), 400) + 24,
    height:
      out.height ?? Math.max(...nodes.map((n) => n.y + n.height), 300) + 24,
  };
}

/** The 16:9 stage the diagram has to fit; used to pick a flow direction. */
const STAGE_ASPECT = 1680 / 860;

function fitScale(d: TutorialDiagram): number {
  return Math.min(1680 / d.width, 860 / d.height);
}

/**
 * Lays the diagram out in both flow directions and keeps the one that fills
 * the widescreen stage better: a ten-node top-down flowchart ends up as a
 * thin column with unreadable labels, while the same graph left-to-right
 * uses the width. The author's direction wins ties.
 */
export async function layoutDiagram(
  id: string,
  parsed: ParsedDiagram,
  mermaid: string,
): Promise<TutorialDiagram> {
  if (parsed.kind === "sequence") return layoutSequence(id, parsed, mermaid);
  const preferred = await layoutGraph(id, parsed, mermaid);
  const alternative = await layoutGraph(
    id,
    { ...parsed, direction: parsed.direction === "DOWN" ? "RIGHT" : "DOWN" },
    mermaid,
  ).catch(() => null);
  if (!alternative) return preferred;
  const preferredAspect = preferred.width / preferred.height;
  const alternativeAspect = alternative.width / alternative.height;
  const closer = (aspect: number) =>
    Math.abs(Math.log(aspect) - Math.log(STAGE_ASPECT));
  // Pick by readable scale first, then by how close the shape is to 16:9.
  if (fitScale(alternative) > fitScale(preferred) * 1.15) return alternative;
  if (
    fitScale(alternative) >= fitScale(preferred) * 0.95 &&
    closer(alternativeAspect) < closer(preferredAspect)
  ) {
    return alternative;
  }
  return preferred;
}

/**
 * Order in which nodes appear when the diagram is drawn: a breadth-first
 * walk from the sources, so the animation follows the real data flow.
 */
export function revealOrder(diagram: TutorialDiagram): string[] {
  if (diagram.kind === "sequence") return diagram.nodes.map((n) => n.id);
  const inDegree = new Map<string, number>(diagram.nodes.map((n) => [n.id, 0]));
  for (const e of diagram.edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);
  }
  const byPosition = [...diagram.nodes].sort((a, b) =>
    diagram.direction === "RIGHT"
      ? a.x - b.x || a.y - b.y
      : a.y - b.y || a.x - b.x,
  );
  const order: string[] = [];
  const seen = new Set<string>();
  const queue = byPosition
    .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const visit = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    diagram.edges
      .filter((e) => e.from === id)
      .map((e) => e.to)
      .forEach((next) => queue.push(next));
  };
  while (queue.length) visit(queue.shift() as string);
  for (const n of byPosition) visit(n.id);
  return order;
}
