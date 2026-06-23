import type { NormalizedIngestionHealth } from "@/lib/agentOpsHealth";

export type AgentOpsAttentionScope = "agent" | "proactive" | "any";

export type AgentOpsAttentionKind =
  | "ingestion_unreachable"
  | "python_unreachable"
  | "local_read_only"
  | "proactive_routes_missing"
  | "proactive_read_only"
  | "generic";

export interface AgentOpsAttention {
  kind: AgentOpsAttentionKind;
  title: string;
  message: string;
  steps?: string[];
  raw?: string;
}

const DEV_WITH_AGENT = "npm run dev:with-agent";
const AGENT_SERVER = "npm run agent:server";
const PROXY_ENV = "AGENT_RUNS_PROXY_URL=http://127.0.0.1:8788";

export function sanitizeAgentOpsRaw(text: string): string {
  return text
    .replace(/bearer\s+[a-zA-Z0-9._~+/=-]+/gi, "bearer [redacted]")
    .replace(
      /(api[_-]?key|token|password|secret|authorization)\s*[:=]\s*['"]?[^\s'"]+/gi,
      "$1=[redacted]",
    )
    .replace(/\bghp_[a-zA-Z0-9]{20,}\b/g, "ghp_[redacted]")
    .replace(/\bgithub_pat_[a-zA-Z0-9_]{20,}\b/g, "github_pat_[redacted]")
    .replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, "sk-[redacted]")
    .replace(/\b(xox[baprs]-)[a-zA-Z0-9-]{10,}\b/g, "$1[redacted]")
    .trim();
}

export function stripAgentOpsMarkup(text: string): string {
  return text
    .replace(/<pre[^>]*>/gi, "\n")
    .replace(/<\/pre>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAgentOpsAttention(
  rawInput: string | null | undefined,
  scope: AgentOpsAttentionScope = "any",
): AgentOpsAttention | null {
  if (!rawInput?.trim()) return null;

  const stripped = stripAgentOpsMarkup(rawInput);
  const sanitized = sanitizeAgentOpsRaw(stripped);
  const lower = sanitized.toLowerCase();

  const missingRoute = sanitized.match(/Cannot GET (\/api\/proactive\/[^\s]+)/i)?.[1];
  if (missingRoute && (scope === "proactive" || scope === "any")) {
    return {
      kind: "proactive_routes_missing",
      title: "Proactive API missing",
      message: "This backend does not expose proactive routes yet.",
      steps: [
        `Restart ingestion with proactive routes (${DEV_WITH_AGENT} or ingest:server:python).`,
        `If you use the Node proxy, run ${AGENT_SERVER} and set ${PROXY_ENV}.`,
      ],
      raw: sanitized,
    };
  }

  if (
    lower.includes("proactive reads work locally") ||
    (lower.includes("proactive") && lower.includes("read-only") && lower.includes("dispatch"))
  ) {
    return {
      kind: "proactive_read_only",
      title: "Proactive read-only",
      message: "Status loads locally; dispatch, approve, and dismiss need the Python API.",
      steps: [DEV_WITH_AGENT, `Or ${AGENT_SERVER} with ${PROXY_ENV} on the ingestion server.`],
      raw: sanitized,
    };
  }

  if (
    lower.includes("proactive api routes") ||
    lower.includes("proactive routes are not") ||
    lower.includes("proactive status is unavailable")
  ) {
    return {
      kind: "proactive_routes_missing",
      title: "Proactive API missing",
      message: "Proactive endpoints are not available on the connected backend.",
      steps: [DEV_WITH_AGENT, `Or restart Python ingestion / ${AGENT_SERVER} behind the proxy.`],
      raw: sanitized,
    };
  }

  if (
    lower.includes("local-read-only") ||
    lower.includes("read-only") && lower.includes("python api") ||
    lower.includes("cannot start new ones until the python")
  ) {
    if (scope === "proactive") {
      return parseAgentOpsAttention(
        "Proactive reads work locally, but dispatch, approve, and dismiss require the Python Agent Ops API.",
        "proactive",
      );
    }
    return {
      kind: "local_read_only",
      title: "Read-only mode",
      message: "Runs can be listed locally; starting runs needs the Python Agent Ops API.",
      steps: [DEV_WITH_AGENT, `Or ${AGENT_SERVER} with ${PROXY_ENV} when using the Node ingestion server.`],
      raw: sanitized,
    };
  }

  if (
    lower.includes("python agent ops is not reachable") ||
    lower.includes("not reachable at http") ||
    lower.includes("agent ops is not reachable") ||
    lower.includes("econnrefused") && lower.includes("8788")
  ) {
    return {
      kind: "python_unreachable",
      title: "Python API unreachable",
      message: "Ingestion is up but the Python Agent Ops service is not responding.",
      steps: [
        `Start ${AGENT_SERVER} (default port 8788).`,
        `Point ingestion at it: ${PROXY_ENV}, or use ${DEV_WITH_AGENT}.`,
      ],
      raw: sanitized,
    };
  }

  if (
    lower.includes("could not reach the ingestion") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("ingestion api")
  ) {
    return {
      kind: "ingestion_unreachable",
      title: "Ingestion offline",
      message: "Agent Ops cannot reach the ingestion API.",
      steps: [DEV_WITH_AGENT, "Or run the ingestion server in a separate terminal."],
      raw: sanitized,
    };
  }

  if (scope === "proactive" && lower.includes("proactive backend")) {
    return {
      kind: "generic",
      title: "Proactive error",
      message: summarizeForPanel(sanitized),
      raw: sanitized,
    };
  }

  if (scope === "agent" || scope === "any") {
    return {
      kind: "generic",
      title: scope === "agent" ? "Agent Ops error" : "Backend notice",
      message: summarizeForPanel(sanitized),
      raw: sanitized,
    };
  }

  return null;
}

export function resolveAgentBackendAttention(
  health: NormalizedIngestionHealth | null,
): AgentOpsAttention | null {
  if (!health) {
    return {
      kind: "ingestion_unreachable",
      title: "Ingestion offline",
      message: "Agent Ops cannot reach the ingestion API.",
      steps: [DEV_WITH_AGENT, "Or start the ingestion server manually."],
    };
  }

  const agent = health.agentRuns;
  if (!agent) {
    return {
      kind: "generic",
      title: "Health diagnostics missing",
      message: "Agent Ops health is missing from ingestion. Restart the ingestion server.",
      steps: ["Restart npm run ingest:server or dev:with-agent."],
    };
  }

  if (agent.mode === "native" || health.ingestionMode === "python") {
    if (agent.connected !== false && agent.routesAvailable !== false) return null;
  }

  if (agent.mode === "local-read-only" || agent.writes === "read-only") {
    return parseAgentOpsAttention(
      "Agent Ops can list past runs but cannot start new ones until the Python API is connected.",
      "agent",
    );
  }

  if (agent.mode === "proxy") {
    if (agent.connected === false || agent.agentReachable === false) {
      return parseAgentOpsAttention(
        `Python Agent Ops is not reachable at ${agent.proxyBase ?? "the proxy URL"}.`,
        "agent",
      );
    }
    if (agent.writes === "proxied" && agent.routesAvailable) {
      return null;
    }
  }

  if (agent.routesAvailable === false) {
    return {
      kind: "python_unreachable",
      title: "Agent routes missing",
      message: "Agent Ops routes are not registered on the connected backend.",
      steps: [`Restart ${AGENT_SERVER} or use Python ingestion (dev:with-agent).`],
    };
  }

  return null;
}

export function resolveProactiveBackendAttention(
  health: NormalizedIngestionHealth | null,
): AgentOpsAttention | null {
  if (!health) return null;

  const proactive = health.proactive;
  if (!proactive) {
    return {
      kind: "generic",
      title: "Proactive health missing",
      message: "Proactive diagnostics are missing from ingestion.",
      steps: ["Update and restart the ingestion server."],
    };
  }

  if (proactive.routesAvailable === false) {
    return parseAgentOpsAttention(
      proactive.mode === "proxy" || health.agentRuns?.mode === "proxy"
        ? "Proactive API routes are not available through the ingestion proxy."
        : "Proactive API routes are not registered on the ingestion server.",
      "proactive",
    );
  }

  if (proactive.writes === "read-only" || proactive.mode === "local-read-only") {
    return parseAgentOpsAttention(
      "Proactive reads work locally, but dispatch, approve, and dismiss require the Python Agent Ops API.",
      "proactive",
    );
  }

  if (
    proactive.mode === "proxy" &&
    (health.agentRuns?.connected === false || health.agentRuns?.agentReachable === false)
  ) {
    return resolveAgentBackendAttention(health);
  }

  if (proactive.writes === "proxied" && proactive.routesAvailable) {
    return null;
  }

  if (proactive.writes === "full" && proactive.routesAvailable !== false) {
    return null;
  }

  return null;
}

/** @deprecated Use parseAgentOpsAttention — kept for string call sites migrating gradually */
export function formatProactiveHint(hint?: string | null) {
  const attention = parseAgentOpsAttention(hint, "proactive");
  return attention?.message ?? null;
}

function summarizeForPanel(text: string) {
  const sentence = text.split(/(?<=[.!?])\s+/)[0]?.trim() || text;
  if (sentence.length <= 140) return sentence;
  return `${sentence.slice(0, 137)}…`;
}
