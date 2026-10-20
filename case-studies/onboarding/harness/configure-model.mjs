#!/usr/bin/env node
/**
 * Points the isolated case-study agent-server at a real model, the same way
 * the live E2E framework does (tests/e2e/live/utils/agent-server-conversation.ts):
 * save an LLM profile, activate it, and set it on the agent settings.
 *
 * The key is read from the repository's .env (VITE_GEMINI_API_KEY) and sent
 * only to the local agent-server, which must be the isolated study stack
 * (OH_CANVAS_SAFE_STATE_DIR=.tmp/onboarding-study/state, so its settings
 * persist under .tmp/onboarding-study/, gitignored). Neither the key nor any
 * response body is ever printed.
 *
 *   node configure-model.mjs [--model gemini/gemini-2.5-flash] [--backend http://127.0.0.1:18000]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const repo = resolve(new URL("../../..", import.meta.url).pathname);
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const model = arg("model", "gemini/gemini-2.5-flash");
const backend = arg("backend", "http://127.0.0.1:18000");
export const PROFILE = "onboarding-study";

function envValue(name) {
  const line = readFileSync(join(repo, ".env"), "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const apiKey = envValue("VITE_GEMINI_API_KEY");
if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is not set in .env");
const sessionKey = readFileSync(
  join(homedir(), ".openhands/agent-canvas/api-key.txt"),
  "utf8",
).trim();
const headers = { "X-Session-API-Key": sessionKey, "content-type": "application/json" };
const llm = { model, api_key: apiKey, temperature: 0 };

async function call(method, path, body) {
  const res = await fetch(`${backend}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Bodies are never printed: these requests carry the key.
  console.log(`${method} ${path} -> ${res.status}`);
  if (!res.ok && method !== "DELETE") process.exitCode = 1;
}

await call("DELETE", `/api/profiles/${PROFILE}`);
await call("POST", `/api/profiles/${PROFILE}`, { llm, include_secrets: true });
await call("POST", `/api/profiles/${PROFILE}/activate`);
await call("PATCH", "/api/settings", {
  agent_settings_diff: { llm },
  misc_settings_diff: { app_preferences: { user_consents_to_analytics: false } },
});
console.log(`model: ${model}`);
