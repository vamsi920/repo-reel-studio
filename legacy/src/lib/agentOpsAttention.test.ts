import { describe, expect, it } from "vitest";

import {
  parseAgentOpsAttention,
  resolveAgentBackendAttention,
  resolveProactiveBackendAttention,
  sanitizeAgentOpsRaw,
} from "@/lib/agentOpsAttention";
import { normalizeIngestionHealth } from "@/lib/agentOpsHealth";

describe("agentOpsAttention", () => {
  it("maps Cannot GET proactive status to routes missing", () => {
    const attention = parseAgentOpsAttention("Cannot GET /api/proactive/status", "proactive");
    expect(attention?.kind).toBe("proactive_routes_missing");
    expect(attention?.steps?.length).toBeGreaterThan(0);
  });

  it("redacts bearer tokens from raw details", () => {
    const raw = sanitizeAgentOpsRaw("Authorization: bearer abc.def.ghi secret");
    expect(raw).not.toContain("abc.def");
    expect(raw).toContain("[redacted]");
  });

  it("resolveAgentBackendAttention for local read-only", () => {
    const attention = resolveAgentBackendAttention(
      normalizeIngestionHealth({
        agentRuns: { mode: "local-read-only", routesAvailable: true, writes: "read-only" },
      }),
    );
    expect(attention?.kind).toBe("local_read_only");
    expect(attention?.message.length).toBeLessThan(120);
  });

  it("resolveProactiveBackendAttention when routes are missing", () => {
    const attention = resolveProactiveBackendAttention(
      normalizeIngestionHealth({
        proactive: { mode: "proxy", routesAvailable: false, writes: "proxied" },
        agentRuns: { mode: "proxy", connected: false, agentReachable: false },
      }),
    );
    expect(attention?.kind).toBe("proactive_routes_missing");
  });

  it("python unreachable from proxy error text", () => {
    const attention = parseAgentOpsAttention(
      "Python Agent Ops is not reachable at http://127.0.0.1:8788",
      "agent",
    );
    expect(attention?.kind).toBe("python_unreachable");
  });
});
