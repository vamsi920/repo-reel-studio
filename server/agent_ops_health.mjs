/**
 * Agent Ops + proactive health diagnostics (Node ingestion + proxy merge).
 */

export function buildLocalIngestionHealth() {
  return {
    status: "ok",
    service: "repo-ingestion-server",
    ingestionMode: "fast-node",
    timestamp: new Date().toISOString(),
    agentRuns: {
      mode: "local-read-only",
      connected: false,
      routesAvailable: true,
      writes: "read-only",
      proxyBase: null,
      agentReachable: null,
    },
    proactive: {
      mode: "local-read-only",
      connected: false,
      routesAvailable: true,
      writes: "read-only",
    },
  };
}

function capabilityFromUpstream(section, { mode, proxyBase, connected }) {
  if (section && typeof section === "object") {
    return {
      mode,
      connected,
      routesAvailable: section.routesAvailable !== false,
      writes: section.writes || "proxied",
      proxyBase,
      agentReachable: connected,
    };
  }
  return {
    mode,
    connected,
    routesAvailable: connected,
    writes: connected ? "proxied" : "read-only",
    proxyBase,
    agentReachable: connected,
  };
}

export function buildProxyIngestionHealth(proxyBase, upstream, agentReachable) {
  const base = buildLocalIngestionHealth();
  base.agentRuns = capabilityFromUpstream(upstream?.agentRuns, {
    mode: "proxy",
    proxyBase,
    connected: agentReachable,
  });
  base.proactive = capabilityFromUpstream(upstream?.proactive, {
    mode: "proxy",
    proxyBase,
    connected: agentReachable,
  });
  if (!agentReachable) {
    base.status = "degraded";
  }
  return base;
}
