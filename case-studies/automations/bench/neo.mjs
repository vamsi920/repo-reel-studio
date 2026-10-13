// Drive the local NeoDevEx automation API the way the app's service layer does.
//   node case-studies/automations/bench/neo.mjs create <scenario-id> [cron | trigger-json]
//   node case-studies/automations/bench/neo.mjs dispatch <automation-id>
//   node case-studies/automations/bench/neo.mjs patch <automation-id> '<json>'
// The prompt goes through withDeliveryContract, exactly as
// AutomationService.createAutomationDraft sends it.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { withDeliveryContract } from "../../../src/lib/automation/delivery-contract.ts";

const BASE = process.env.NEO_URL ?? "http://localhost:8000";
const KEY = readFileSync(join(homedir(), ".openhands/agent-canvas/api-key.txt"), "utf8").trim();
const suite = JSON.parse(readFileSync(new URL("../suite.json", import.meta.url), "utf8"));

async function call(method, path, body) {
  const started = performance.now();
  const res = await fetch(`${BASE}/api/automation${path}`, {
    method,
    headers: { "X-Session-API-Key": KEY, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const ms = Math.round(performance.now() - started);
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return { data: text ? JSON.parse(text) : null, ms };
}

const [cmd, arg, extra] = process.argv.slice(2);
if (cmd === "create") {
  const s = suite.scenarios.find((x) => x.id === arg);
  const repo = s.id === "A8-failure" ? "vamsi920/automation-bench-missing" : suite.repo;
  const { data, ms } = await call("POST", "/v1/preset/prompt", {
    name: s.name,
    prompt: withDeliveryContract(s.instructions),
    trigger: extra?.startsWith("{")
      ? JSON.parse(extra)
      : { type: "cron", schedule: extra ?? "0 0 1 1 *", timezone: "America/New_York" },
    enabled: true,
    repos: [{ url: `https://github.com/${repo}`, provider: "github" }],
  });
  console.log(JSON.stringify({ id: data.id, name: data.name, trigger: data.trigger, create_ms: ms }));
} else if (cmd === "dispatch") {
  const { data, ms } = await call("POST", `/v1/${arg}/dispatch`);
  console.log(JSON.stringify({ run: data.id ?? data.run_id, status: data.status, dispatch_ms: ms }));
} else if (cmd === "patch") {
  const patch = JSON.parse(extra);
  if (typeof patch.prompt === "string") patch.prompt = withDeliveryContract(patch.prompt);
  const { data, ms } = await call("PATCH", `/v1/${arg}`, patch);
  console.log(JSON.stringify({ id: data.id, enabled: data.enabled, trigger: data.trigger, patch_ms: ms }));
} else {
  throw new Error("usage: create|dispatch|patch");
}
