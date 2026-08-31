#!/usr/bin/env node
/**
 * Environment preflight -- answers "can this install actually run?" from the
 * host it is executed on.
 *
 * This is the only vantage that tells the truth about a customer's network.
 * A Supabase Edge Function checking egress reports SUPABASE's connectivity,
 * and the browser is CORS-limited; neither one knows whether the agent-server
 * host can reach github.com through the corporate proxy. Run this on the
 * machine that runs the workload.
 *
 * Usage:
 *   node scripts/environment-preflight.mjs
 *   node scripts/environment-preflight.mjs --json
 *   node scripts/environment-preflight.mjs --features knowledge.deepwiki,automations.jira-trigger
 *
 * Reads (all optional -- an unset input yields an "unknown" check, never a
 * false failure):
 *   VITE_BACKEND_BASE_URL / BACKEND_BASE_URL   agent-server origin
 *   VITE_SESSION_API_KEY / LOCAL_BACKEND_API_KEY  session key to test with
 *   VITE_SUPABASE_URL / SUPABASE_URL           Supabase project
 *   SUPABASE_SERVICE_ROLE_KEY                  enables pg-extension + bucket checks
 *   HTTPS_PROXY / HTTP_PROXY / NO_PROXY        honoured for reporting
 *   ENVIRONMENT_MIRRORS                        JSON map, e.g. {"registry.npmjs.org":"nexus.corp/npm"}
 *
 * Exit codes: 0 = no blocking failures, 1 = at least one blocking failure,
 * 2 = the script itself could not run.
 */

import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REQUIREMENTS_PATH = resolve(HERE, "..", "config", "environment-requirements.json");

const NETWORK_TIMEOUT_MS = 6000;
const BINARY_TIMEOUT_MS = 5000;

/** @typedef {{id:string,group:string,label:string,status:"ok"|"fail"|"unknown",severity:"blocking"|"degrading"|"optional",detail?:string,observed?:string,remediation?:string}} Check */

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const noFail = args.includes("--no-fail");
const featuresFlag = args.find((a) => a.startsWith("--features="));
const enabledFeatures = featuresFlag
  ? featuresFlag.slice("--features=".length).split(",").map((s) => s.trim()).filter(Boolean)
  : null;

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function loadRequirements() {
  try {
    return JSON.parse(readFileSync(REQUIREMENTS_PATH, "utf8"));
  } catch (error) {
    process.stderr.write(
      `environment-preflight: cannot read ${REQUIREMENTS_PATH}: ${error?.message ?? error}\n`,
    );
    process.exit(2);
  }
}

function loadMirrors() {
  const raw = env("ENVIRONMENT_MIRRORS");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    process.stderr.write("environment-preflight: ENVIRONMENT_MIRRORS is not valid JSON; ignoring\n");
    return {};
  }
}

/** Compares dotted version strings numerically; missing segments count as 0. */
function meetsMinVersion(observed, minimum) {
  // Version strings arrive in many shapes: "v24.14.0", "Python 3.14.6",
  // "git version 2.54.0 (Apple Git-157)". Take the first dotted-number run.
  const parse = (value) => {
    const match = /\d+(?:\.\d+)*/.exec(String(value));
    if (!match) return null;
    return match[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
  };
  const got = parse(observed);
  const want = parse(minimum);
  if (!got || !want) return true;
  for (let i = 0; i < Math.max(got.length, want.length); i += 1) {
    const a = got[i] ?? 0;
    const b = want[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkEgress(entry, mirrors) {
  const mirror = mirrors[entry.host];
  const target = mirror ? String(mirror) : entry.host;
  const url = target.startsWith("http") ? target : `https://${target}`;
  const started = Date.now();
  try {
    // HEAD is rejected by several of these hosts; GET with no body read is
    // enough to prove DNS + TCP + TLS + proxy traversal.
    const response = await fetchWithTimeout(url, { method: "GET", redirect: "manual" });
    const latency = Date.now() - started;
    // Any HTTP status means the connection succeeded. Only a thrown error
    // (DNS, TLS, proxy refusal, timeout) is a reachability failure.
    return {
      status: "ok",
      detail: `HTTP ${response.status} in ${latency}ms${mirror ? ` via mirror ${target}` : ""}`,
      observed: String(response.status),
    };
  } catch (error) {
    const message = String(error?.cause?.code ?? error?.name ?? error?.message ?? error);
    return {
      status: "fail",
      detail: message,
      remediation: mirror
        ? `Mirror ${target} is unreachable. Verify the ENVIRONMENT_MIRRORS entry for ${entry.host}.`
        : entry.mirrorable
          ? `Allow ${entry.host}:${entry.port} outbound, or set ENVIRONMENT_MIRRORS to point it at an internal mirror.`
          : `Allow ${entry.host}:${entry.port} outbound. This host cannot be mirrored.`,
    };
  }
}

async function checkBinary(entry) {
  try {
    const { stdout, stderr } = await execFileAsync(entry.name, entry.versionArgs ?? ["--version"], {
      timeout: BINARY_TIMEOUT_MS,
    });
    const observed = (stdout || stderr || "").trim().split("\n")[0] ?? "";
    if (entry.minVersion && !meetsMinVersion(observed, entry.minVersion)) {
      return {
        status: "fail",
        observed,
        detail: `found ${observed}, need >= ${entry.minVersion}`,
        remediation: `Upgrade ${entry.name} to ${entry.minVersion} or newer.`,
      };
    }
    return { status: "ok", observed, detail: observed };
  } catch (error) {
    return {
      status: "fail",
      detail: String(error?.code === "ENOENT" ? "not found on PATH" : (error?.message ?? error)),
      remediation: `Install ${entry.name}${entry.minVersion ? ` (>= ${entry.minVersion})` : ""} and make sure it is on PATH.`,
    };
  }
}

/**
 * The key-drift check. Deliberately hits an AUTHENTICATED endpoint: /health
 * answers 200 even when the session key is wrong, which is exactly why key
 * drift between Netlify's VITE_SESSION_API_KEY and Fly's LOCAL_BACKEND_API_KEY
 * has historically presented as random, hard-to-place 401s.
 */
async function checkBackendKey() {
  const baseUrl = env("VITE_BACKEND_BASE_URL", "BACKEND_BASE_URL");
  const key = env("VITE_SESSION_API_KEY", "LOCAL_BACKEND_API_KEY");
  if (!baseUrl) {
    return { status: "unknown", detail: "VITE_BACKEND_BASE_URL not set in this shell" };
  }
  if (!key) {
    return { status: "unknown", detail: "no session key in this shell to test with" };
  }
  const url = `${baseUrl.replace(/\/+$/, "")}/api/settings`;
  try {
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { "X-Session-API-Key": key },
    });
    if (response.status === 401 || response.status === 403) {
      return {
        status: "fail",
        observed: String(response.status),
        detail: `authenticated request rejected with ${response.status}`,
        remediation:
          "The session key does not match the backend. Set Netlify's VITE_SESSION_API_KEY to the same value as Fly's LOCAL_BACKEND_API_KEY, then redeploy the frontend (the key is baked in at build time).",
      };
    }
    if (!response.ok) {
      return {
        status: "unknown",
        observed: String(response.status),
        detail: `unexpected status ${response.status} from ${url}`,
      };
    }
    return { status: "ok", detail: `authenticated OK (${response.status})` };
  } catch (error) {
    return {
      status: "fail",
      detail: String(error?.cause?.code ?? error?.message ?? error),
      remediation: `Could not reach ${url}. Check that the agent-server is running and reachable from this host.`,
    };
  }
}

async function supabaseRpcChecks(requirements) {
  const supabaseUrl = env("VITE_SUPABASE_URL", "SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return {
      skipped: true,
      reason: !supabaseUrl
        ? "VITE_SUPABASE_URL not set"
        : "SUPABASE_SERVICE_ROLE_KEY not set (extension and bucket checks need it)",
    };
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const base = supabaseUrl.replace(/\/+$/, "");

  /** Reads pg_extension through PostgREST's exposed catalogue view when present. */
  async function installedExtensions() {
    const response = await fetchWithTimeout(`${base}/rest/v1/rpc/environment_installed_extensions`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!response.ok) return null;
    const rows = await response.json();
    if (!Array.isArray(rows)) return null;
    return rows.map((row) => String(row.extname ?? row.name ?? ""));
  }

  async function listBuckets() {
    const response = await fetchWithTimeout(`${base}/storage/v1/bucket`, { headers });
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) ? rows : null;
  }

  const [extensions, buckets] = await Promise.all([
    installedExtensions().catch(() => null),
    listBuckets().catch(() => null),
  ]);

  return { skipped: false, extensions, buckets, requirements };
}

function severityFor(entry, fallback) {
  if (entry.optional) return "optional";
  return fallback;
}

async function main() {
  const requirements = loadRequirements();
  const mirrors = loadMirrors();
  /** @type {Check[]} */
  const checks = [];

  const proxy = env("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy");
  if (proxy) {
    checks.push({
      id: "network.proxy",
      group: "network",
      label: "Outbound proxy configured",
      status: "ok",
      severity: "optional",
      detail: `${proxy}${env("NO_PROXY", "no_proxy") ? ` (NO_PROXY=${env("NO_PROXY", "no_proxy")})` : ""}`,
    });
  }

  const egressEntries = [
    ...requirements.platformEgress,
    ...requirements.featureEgress.filter((entry) =>
      enabledFeatures === null
        ? false
        : (entry.requiredFor ?? []).some((feature) => enabledFeatures.includes(feature)),
    ),
  ];

  const egressResults = await Promise.all(
    egressEntries.map(async (entry) => ({ entry, result: await checkEgress(entry, mirrors) })),
  );
  for (const { entry, result } of egressResults) {
    checks.push({
      id: `egress.${entry.host}`,
      group: "egress",
      label: `${entry.host}:${entry.port}`,
      status: result.status,
      severity: entry.mirrorable ? "degrading" : "blocking",
      detail: result.detail,
      observed: result.observed,
      remediation: result.remediation,
    });
  }

  const binaryResults = await Promise.all(
    requirements.hostBinaries.map(async (entry) => ({ entry, result: await checkBinary(entry) })),
  );
  for (const { entry, result } of binaryResults) {
    checks.push({
      id: `binary.${entry.name}`,
      group: "host",
      label: entry.name + (entry.minVersion ? ` >= ${entry.minVersion}` : ""),
      status: result.status,
      severity: severityFor(entry, "blocking"),
      detail: result.detail,
      observed: result.observed,
      remediation: result.remediation,
    });
  }

  const backendKey = await checkBackendKey();
  checks.push({
    id: "backend.session-key",
    group: "backend",
    label: "Agent-server session key (authenticated)",
    status: backendKey.status,
    severity: "blocking",
    detail: backendKey.detail,
    observed: backendKey.observed,
    remediation: backendKey.remediation,
  });

  const fileStore = env("FILE_STORE");
  checks.push({
    id: "env.FILE_STORE",
    group: "env",
    label: "FILE_STORE=local",
    status: fileStore === undefined ? "unknown" : fileStore === "local" ? "ok" : "fail",
    severity: "degrading",
    detail: fileStore ?? "not set in this shell",
    remediation:
      fileStore === undefined || fileStore === "local"
        ? undefined
        : "Set FILE_STORE=local on the agent-server. Left unset or pointed elsewhere, the automation service falls back to S3/GCS and preset uploads fail silently.",
  });

  const supabase = await supabaseRpcChecks(requirements);
  if (supabase.skipped) {
    checks.push({
      id: "supabase.checks",
      group: "supabase",
      label: "Postgres extensions and storage buckets",
      status: "unknown",
      severity: "blocking",
      detail: supabase.reason,
      remediation:
        "Re-run with VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set to verify extensions and buckets.",
    });
  } else {
    for (const extension of requirements.pgExtensions) {
      const installed = supabase.extensions;
      checks.push({
        id: `pg-extension.${extension.name}`,
        group: "supabase",
        label: `extension ${extension.name}`,
        status:
          installed === null
            ? "unknown"
            : installed.includes(extension.name)
              ? "ok"
              : "fail",
        severity: severityFor(extension, "blocking"),
        detail:
          installed === null
            ? "environment_installed_extensions RPC not available on this project"
            : installed.includes(extension.name)
              ? "installed"
              : "not installed",
        remediation:
          installed === null
            ? undefined
            : `Run: create extension if not exists ${extension.name};`,
      });
    }
    for (const bucket of requirements.storageBuckets) {
      const found = supabase.buckets?.find((row) => row.name === bucket.name);
      checks.push({
        id: `bucket.${bucket.name}`,
        group: "supabase",
        label: `bucket ${bucket.name}`,
        status: supabase.buckets === null ? "unknown" : found ? "ok" : "fail",
        severity: "degrading",
        detail: supabase.buckets === null ? "storage API not reachable" : found ? "present" : "missing",
        remediation: found ? undefined : `Create the private storage bucket "${bucket.name}".`,
      });
      if (found && found.public === true && bucket.public === false) {
        checks.push({
          id: `bucket.${bucket.name}.visibility`,
          group: "supabase",
          label: `bucket ${bucket.name} is private`,
          status: "fail",
          severity: "blocking",
          detail: "bucket is public",
          remediation: `Set the "${bucket.name}" bucket to private. Workspace artifacts must not be world-readable.`,
        });
      }
    }
  }

  const blocking = checks.filter((c) => c.status === "fail" && c.severity === "blocking");
  const degrading = checks.filter((c) => c.status === "fail" && c.severity === "degrading");
  const unknown = checks.filter((c) => c.status === "unknown");

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          schemaVersion: 1,
          vantage: "runtime",
          host: process.env.HOSTNAME ?? null,
          probedAt: new Date().toISOString(),
          summary: {
            total: checks.length,
            ok: checks.filter((c) => c.status === "ok").length,
            blocking: blocking.length,
            degrading: degrading.length,
            unknown: unknown.length,
          },
          checks,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    const symbol = { ok: "PASS", fail: "FAIL", unknown: " ?  " };
    let currentGroup = "";
    for (const check of checks) {
      if (check.group !== currentGroup) {
        currentGroup = check.group;
        process.stdout.write(`\n${currentGroup.toUpperCase()}\n`);
      }
      process.stdout.write(
        `  [${symbol[check.status]}] ${check.label}${check.detail ? ` -- ${check.detail}` : ""}\n`,
      );
      if (check.status === "fail" && check.remediation) {
        process.stdout.write(`          fix: ${check.remediation}\n`);
      }
    }
    process.stdout.write(
      `\n${blocking.length} blocking, ${degrading.length} degrading, ${unknown.length} unknown, ` +
        `${checks.filter((c) => c.status === "ok").length}/${checks.length} passing\n`,
    );
    if (unknown.length > 0) {
      process.stdout.write(
        "Unknown checks are inputs this shell could not see -- they are not failures.\n",
      );
    }
  }

  process.exit(blocking.length > 0 && !noFail ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`environment-preflight: ${error?.stack ?? error}\n`);
  process.exit(2);
});
