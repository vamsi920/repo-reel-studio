import { API_URL } from "@/env";

export type GraphConfidence = "EXTRACTED" | "INFERRED";

export interface GraphSubgraphEdge {
  from: string;
  to: string;
  relation: string;
  confidence: GraphConfidence | string;
}

export interface GraphSubgraph {
  nodeLabels: string[];
  nodeIds: string[];
  edges: GraphSubgraphEdge[];
}

export interface GraphExplainResult {
  available: boolean;
  kind?: "explain";
  reason?: string;
  text?: string;
  node?: string | null;
  id?: string | null;
  source?: string | null;
  filePath?: string | null;
  startLine?: number | null;
  community?: number | string | null;
  degree?: number | null;
  connections?: Array<{
    direction: string;
    target: string;
    relation: string;
    confidence: string;
    source?: string | null;
  }>;
  subgraph?: GraphSubgraph;
  projectId?: string;
  label?: string;
}

export interface GraphPathResult {
  available: boolean;
  kind?: "path";
  reason?: string;
  text?: string;
  hops?: number;
  from?: string;
  to?: string;
  edges?: Array<{
    from: string;
    to: string;
    relation: string;
    confidence: string;
    direction?: string;
    label?: string;
  }>;
  subgraph?: GraphSubgraph;
  projectId?: string;
}

export type GraphIntent =
  | { kind: "path"; from: string; to: string }
  | { kind: "explain"; label: string }
  | null;

const graphApiUrl = (path: string) =>
  API_URL === "/api" ? `/api/graph${path}` : `${API_URL}/api/graph${path}`;

export async function fetchGraphStatus(projectId: string): Promise<{
  ready: boolean;
  reason?: string | null;
  nodeCount?: number | null;
  extractedAt?: string | null;
}> {
  const response = await fetch(
    `${graphApiUrl("/status")}?projectId=${encodeURIComponent(projectId)}`
  );
  if (!response.ok) {
    return { ready: false, reason: `status HTTP ${response.status}` };
  }
  return response.json();
}

export async function fetchGraphExplain(
  projectId: string,
  label: string
): Promise<GraphExplainResult> {
  const response = await fetch(graphApiUrl("/explain"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, label }),
  });
  if (!response.ok) {
    return { available: false, reason: `explain HTTP ${response.status}` };
  }
  return response.json();
}

export async function fetchGraphPath(
  projectId: string,
  from: string,
  to: string
): Promise<GraphPathResult> {
  const response = await fetch(graphApiUrl("/path"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, from, to }),
  });
  if (!response.ok) {
    return { available: false, reason: `path HTTP ${response.status}` };
  }
  return response.json();
}

/**
 * Detect graphify-style path/explain intents from a natural-language question.
 * Conservative: only fire when both endpoints (path) or a clear explain target exist.
 */
export function detectGraphIntent(question: string): GraphIntent {
  const q = question.trim();
  if (!q) return null;

  const pathPatterns: RegExp[] = [
    /how\s+does\s+(.+?)\s+connect\s+to\s+(.+?)[?.!]?\s*$/i,
    /path\s+from\s+(.+?)\s+to\s+(.+?)[?.!]?\s*$/i,
    /trace\s+(.+?)\s+to\s+(.+?)[?.!]?\s*$/i,
    /how\s+(?:are|is)\s+(.+?)\s+(?:and|&)\s+(.+?)\s+connected[?.!]?\s*$/i,
    /shortest\s+path\s+(?:between\s+)?(.+?)\s+(?:and|->|→)\s+(.+?)[?.!]?\s*$/i,
  ];

  for (const pattern of pathPatterns) {
    const match = q.match(pattern);
    if (match?.[1] && match?.[2]) {
      const from = cleanLabel(match[1]);
      const to = cleanLabel(match[2]);
      if (from && to && from.toLowerCase() !== to.toLowerCase()) {
        return { kind: "path", from, to };
      }
    }
  }

  const explainPatterns: RegExp[] = [
    /^explain\s+(.+?)[?.!]?\s*$/i,
    /^what\s+is\s+(.+?)[?.!]?\s*$/i,
    /^connections?\s+of\s+(.+?)[?.!]?\s*$/i,
    /^tell\s+me\s+about\s+(.+?)[?.!]?\s*$/i,
  ];

  for (const pattern of explainPatterns) {
    const match = q.match(pattern);
    if (match?.[1]) {
      const label = cleanLabel(match[1]);
      if (label && label.length >= 2 && label.length <= 80) {
        return { kind: "explain", label };
      }
    }
  }

  return null;
}

function cleanLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"'“”]+|[`"'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an)\s+/i, "")
    .trim();
}

export function graphResultToTraceSteps(
  result: GraphPathResult | GraphExplainResult
): Array<{ label: string; summary: string; confidence?: string }> {
  if (!result.available) return [];

  if (result.kind === "path" && "edges" in result && result.edges?.length) {
    return result.edges.map((edge, index) => ({
      label: edge.label || `${edge.from} --${edge.relation}--> ${edge.to}`,
      summary: `Hop ${index + 1}: ${edge.relation} [${edge.confidence}]`,
      confidence: edge.confidence,
    }));
  }

  if (result.kind === "explain" && "connections" in result) {
    const explain = result as GraphExplainResult;
    const steps = (explain.connections || []).slice(0, 5).map((conn) => ({
      label: `${conn.direction} ${conn.target} [${conn.relation}]`,
      summary: `${conn.confidence}${conn.source ? ` · ${conn.source}` : ""}`,
      confidence: conn.confidence,
    }));
    if (explain.node) {
      return [
        {
          label: `Node: ${explain.node}`,
          summary: [
            explain.source ? `Source ${explain.source}` : null,
            explain.degree != null ? `degree ${explain.degree}` : null,
            explain.community != null ? `community ${explain.community}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
        },
        ...steps,
      ];
    }
    return steps;
  }

  return [];
}
