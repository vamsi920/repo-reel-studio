#!/usr/bin/env node
/**
 * Bug Fixer webhook receiver.
 *
 * The Bug Fixer connector (src/components/features/automations/bug-fixer-connectors.tsx)
 * creates a real, persisted automation via the automation API — but that
 * automation only *runs* when something calls its `/dispatch` endpoint.
 * Locally, that "something" is normally the external `openhands.automation`
 * package (a separate GitHub repo, pulled in at dev-server start by
 * `scripts/dev-with-automation.mjs` — this repo doesn't own its source, so
 * webhook delivery for a real production deployment goes through it).
 *
 * This script is the piece this repo *does* own end-to-end: a small local
 * server that receives a signed GitHub or Jira issue webhook, verifies it,
 * finds the matching Bug Fixer automation by repository + source, and
 * dispatches it — closing the loop from "issue labeled bug" to "an agent
 * run actually starts" without depending on the external package.
 *
 * Usage:
 *   node scripts/bug-fixer-webhook-server.mjs
 *
 * Env:
 *   BUG_FIXER_WEBHOOK_PORT   Port to listen on (default 8787)
 *   AGENT_CANVAS_URL         Base URL of the running agent-canvas backend
 *                            (default http://localhost:8000, matching the
 *                            local dev proxy port in config/defaults.json)
 *   GITHUB_WEBHOOK_SECRET    Shared secret configured on the GitHub webhook
 *                            (verified against X-Hub-Signature-256)
 *   JIRA_WEBHOOK_SECRET      Shared secret expected in the
 *                            X-Automation-Webhook-Token header from a Jira
 *                            Automation "send web request" action
 *   LOCAL_BACKEND_API_KEY    Overrides the auto-discovered session API key
 *                            (falls back to the same persisted key file
 *                            `npm run dev` already generates/uses)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import process from "node:process";
import { getOrCreatePersistedApiKeyFile } from "./dev-safe.mjs";

const PORT = Number(process.env.BUG_FIXER_WEBHOOK_PORT || 8787);
const AGENT_CANVAS_URL = (
  process.env.AGENT_CANVAS_URL || "http://localhost:8000"
).replace(/\/+$/, "");
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const JIRA_WEBHOOK_SECRET = process.env.JIRA_WEBHOOK_SECRET || "";

function sessionApiKey() {
  return (
    process.env.LOCAL_BACKEND_API_KEY || getOrCreatePersistedApiKeyFile()
  );
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/** Constant-time comparison — never use `===` on secrets/signatures. */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function verifyGitHubSignature(rawBody, signatureHeader) {
  if (!GITHUB_WEBHOOK_SECRET) {
    return { ok: false, reason: "GITHUB_WEBHOOK_SECRET is not configured" };
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return { ok: false, reason: "Missing or malformed X-Hub-Signature-256" };
  }
  const expected =
    "sha256=" +
    createHmac("sha256", GITHUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
  if (!safeEqual(expected, signatureHeader)) {
    return { ok: false, reason: "Signature mismatch" };
  }
  return { ok: true };
}

function verifyJiraToken(tokenHeader) {
  if (!JIRA_WEBHOOK_SECRET) {
    return { ok: false, reason: "JIRA_WEBHOOK_SECRET is not configured" };
  }
  if (!tokenHeader) {
    return { ok: false, reason: "Missing X-Automation-Webhook-Token" };
  }
  if (!safeEqual(tokenHeader, JIRA_WEBHOOK_SECRET)) {
    return { ok: false, reason: "Token mismatch" };
  }
  return { ok: true };
}

/** GitHub `issues` webhook → { repository, shouldFire }. */
function parseGitHubIssueEvent(payload, githubEventHeader) {
  if (githubEventHeader !== "issues") {
    return { shouldFire: false, reason: `Ignoring event type "${githubEventHeader}"` };
  }
  const action = payload?.action;
  if (action !== "opened" && action !== "labeled") {
    return { shouldFire: false, reason: `Ignoring action "${action}"` };
  }
  if (action === "labeled") {
    const labelName = payload?.label?.name?.toLowerCase?.() || "";
    if (!labelName.includes("bug")) {
      return { shouldFire: false, reason: `Label "${labelName}" is not a bug label` };
    }
  }
  const repository = payload?.repository?.full_name;
  if (!repository) {
    return { shouldFire: false, reason: "Payload has no repository.full_name" };
  }
  return {
    shouldFire: true,
    repository,
    issueRef: `#${payload?.issue?.number} ${payload?.issue?.title ?? ""}`.trim(),
  };
}

/**
 * Jira Automation "send web request" payload — shape is whatever the
 * Automation rule's JSON body template sends, so this accepts the common
 * `{ issue: { key, fields: { project: { key } } } }` shape and requires the
 * caller's rule to include it.
 */
function parseJiraIssueEvent(payload) {
  const projectKey = payload?.issue?.fields?.project?.key;
  const issueKey = payload?.issue?.key;
  if (!projectKey) {
    return { shouldFire: false, reason: "Payload has no issue.fields.project.key" };
  }
  return {
    shouldFire: true,
    repository: projectKey,
    issueRef: `${issueKey ?? ""} ${payload?.issue?.fields?.summary ?? ""}`.trim(),
  };
}

async function findAndDispatchAutomation(source, repository, issueRef) {
  const headers = { "X-Session-API-Key": sessionApiKey() };

  const listRes = await fetch(`${AGENT_CANVAS_URL}/api/automation/v1?limit=200`, {
    headers,
  });
  if (!listRes.ok) {
    throw new Error(
      `Failed to list automations: ${listRes.status} ${await listRes.text()}`,
    );
  }
  const listBody = await listRes.json();
  const automations = Array.isArray(listBody) ? listBody : listBody.automations ?? [];

  const matches = automations.filter(
    (a) =>
      a.enabled &&
      a.trigger?.type === "event" &&
      a.trigger?.source === source &&
      a.repository === repository,
  );

  if (matches.length === 0) {
    return {
      dispatched: [],
      message: `No enabled ${source} Bug Fixer automation found for "${repository}". Create one from Automations → Templates, then enable it.`,
    };
  }

  const dispatched = [];
  for (const automation of matches) {
    const res = await fetch(
      `${AGENT_CANVAS_URL}/api/automation/v1/${automation.id}/dispatch`,
      { method: "POST", headers },
    );
    if (!res.ok) {
      throw new Error(
        `Dispatch failed for automation ${automation.id}: ${res.status} ${await res.text()}`,
      );
    }
    dispatched.push({ automationId: automation.id, name: automation.name });
  }

  return {
    dispatched,
    message: `Dispatched ${dispatched.length} automation(s) for ${repository} (${issueRef}).`,
  };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleGitHub(req, res) {
  const rawBody = await readBody(req);
  const verification = verifyGitHubSignature(
    rawBody,
    req.headers["x-hub-signature-256"],
  );
  if (!verification.ok) {
    sendJson(res, 401, { error: verification.reason });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const event = parseGitHubIssueEvent(payload, req.headers["x-github-event"]);
  if (!event.shouldFire) {
    sendJson(res, 200, { skipped: true, reason: event.reason });
    return;
  }

  try {
    const result = await findAndDispatchAutomation(
      "github",
      event.repository,
      event.issueRef,
    );
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

async function handleJira(req, res) {
  const verification = verifyJiraToken(req.headers["x-automation-webhook-token"]);
  if (!verification.ok) {
    sendJson(res, 401, { error: verification.reason });
    return;
  }

  const rawBody = await readBody(req);
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const event = parseJiraIssueEvent(payload);
  if (!event.shouldFire) {
    sendJson(res, 200, { skipped: true, reason: event.reason });
    return;
  }

  try {
    const result = await findAndDispatchAutomation(
      "jira",
      event.repository,
      event.issueRef,
    );
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 502, { error: error.message });
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { status: "ok" });
    return;
  }
  if (req.method === "POST" && req.url === "/webhooks/github") {
    handleGitHub(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }
  if (req.method === "POST" && req.url === "/webhooks/jira") {
    handleJira(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }
  sendJson(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`Bug Fixer webhook server listening on http://localhost:${PORT}`);
  console.log(`  GitHub: POST http://localhost:${PORT}/webhooks/github`);
  console.log(`  Jira:   POST http://localhost:${PORT}/webhooks/jira`);
  console.log(`  Dispatching against: ${AGENT_CANVAS_URL}`);
  if (!GITHUB_WEBHOOK_SECRET) {
    console.warn("  ⚠ GITHUB_WEBHOOK_SECRET not set — GitHub webhooks will be rejected");
  }
  if (!JIRA_WEBHOOK_SECRET) {
    console.warn("  ⚠ JIRA_WEBHOOK_SECRET not set — Jira webhooks will be rejected");
  }
});
