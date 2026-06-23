import { describe, expect, it } from "vitest";
import {
  resolveAgentBackendAttention,
  resolveProactiveBackendAttention,
} from "@/lib/agentOpsAttention";
import { normalizeIngestionHealth } from "@/lib/agentOpsHealth";

describe("agentOpsHealth", () => {
  it("normalizes legacy agentRuns fields", () => {
    const health = normalizeIngestionHealth({
      status: "ok",
      agentRuns: {
        mode: "proxy",
        proxyBase: "http://127.0.0.1:8788",
        agentReachable: true,
      },
    });
    expect(health?.agentRuns?.connected).toBe(true);
    expect(health?.agentRuns?.writes).toBe("proxied");
    expect(health?.agentRuns?.routesAvailable).toBe(true);
  });

  it("resolveAgentBackendAttention for local read-only", () => {
    const attention = resolveAgentBackendAttention(
      normalizeIngestionHealth({
        agentRuns: { mode: "local-read-only", routesAvailable: true, writes: "read-only" },
      }),
    );
    expect(attention?.kind).toBe("local_read_only");
  });

  it("resolveProactiveBackendAttention for proxied writes when agent is up", () => {
    const attention = resolveProactiveBackendAttention(
      normalizeIngestionHealth({
        ingestionMode: "fast-node",
        agentRuns: {
          mode: "proxy",
          connected: true,
          routesAvailable: true,
          writes: "proxied",
          agentReachable: true,
        },
        proactive: {
          mode: "proxy",
          routesAvailable: true,
          writes: "proxied",
        },
      }),
    );
    expect(attention).toBeNull();
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
});
