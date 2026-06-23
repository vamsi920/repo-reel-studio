#!/usr/bin/env node
/**
 * Node health diagnostics (pass 28/40).
 * Run: node server/validate_agent_ops_health.mjs
 */

import assert from "node:assert/strict";
import {
  buildLocalIngestionHealth,
  buildProxyIngestionHealth,
} from "./agent_ops_health.mjs";

const upstream = {
  agentRuns: { mode: "native", connected: true, routesAvailable: true, writes: "full" },
  proactive: { mode: "native", connected: true, routesAvailable: true, writes: "full" },
};

const local = buildLocalIngestionHealth();
assert.equal(local.agentRuns.writes, "read-only");
assert.equal(local.proactive.routesAvailable, true);

const proxy = buildProxyIngestionHealth("http://127.0.0.1:8788", upstream, true);
assert.equal(proxy.agentRuns.writes, "full");
assert.equal(proxy.proactive.writes, "full");

const proxyDefault = buildProxyIngestionHealth("http://127.0.0.1:8788", null, true);
assert.equal(proxyDefault.agentRuns.writes, "proxied");

const down = buildProxyIngestionHealth("http://127.0.0.1:8788", null, false);
assert.equal(down.status, "degraded");

console.log("OK: agent ops health diagnostics (node)");
