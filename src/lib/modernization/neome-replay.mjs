#!/usr/bin/env node
// Neo ME differential replay harness. Installed by Neo ME at .neome/replay.mjs;
// do not edit -- Neo ME rewrites it and reads the report it writes.
//
// Sends every scenario step to the LEGACY app and to the TARGET app and
// compares what a user or client would observe: status code, redirect target,
// content type, and the visible text of HTML pages (plus their form field
// names) or the canonical JSON body. Bodies of redirects are not compared
// (browsers never show them). Differences are bugs in the target.
//
// Usage:
//   node .neome/replay.mjs --legacy http://127.0.0.1:5000 \
//     --target http://127.0.0.1:3000 \
//     --reset-legacy "flask --app flaskr init-db" \
//     --reset-target "node scripts/reset-db.js" parity/scenarios
//   (or PARITY_LEGACY / PARITY_TARGET env vars; files or directories of *.json)
// --reset-legacy / --reset-target run before EVERY scenario, so each one
// starts from the same fresh data in both apps (restore a fixture, re-seed,
// or restart the app); the harness then waits until the app answers again.
// Without them, data left by earlier runs makes the apps differ.
//
// Scenario file (JSON):
// {
//   "name": "auth and posts",
//   "legacyData": false,            // true: runs on data the legacy app wrote
//   "normalize": [{ "pattern": "\\d{2}:\\d{2}", "replace": "<time>" }],
//   "steps": [
//     { "name": "login", "session": "alice", "method": "POST",
//       "path": "/auth/login", "form": { "username": "a", "password": "p" } },
//     { "name": "create", "session": "alice", "method": "POST",
//       "path": "/api/articles", "json": { "article": { "title": "t" } },
//       "headers": { "Authorization": "Token {{token}}" },
//       "capture": { "slug": { "json": "article.slug" } } },
//     { "name": "read", "path": "/api/articles/{{slug}}" }
//   ]
// }
// Steps run in order, per app, with one cookie jar per "session" label.
// "capture" takes a value from the response ({ "json": "a.b.0.c" },
// { "header": "location" } or { "regex": "...(group)..." }); "{{name}}" in
// path, headers and bodies is replaced with that app's own captured value,
// so generated ids/slugs may differ between the apps. JWTs, ISO timestamps
// and UUIDs are normalised automatically; add "normalize" rules only for
// values that are legitimately random. Never normalise away real output.
//
// Writes .neome/replay-report.json (or --report <file>) and exits non-zero
// unless every step is identical.

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;

function parseArgs(argv) {
  const out = {
    legacy: process.env.PARITY_LEGACY,
    target: process.env.PARITY_TARGET,
    report: ".neome/replay-report.json",
    resetLegacy: process.env.PARITY_RESET_LEGACY,
    resetTarget: process.env.PARITY_RESET_TARGET,
    paths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--legacy") out.legacy = argv[++i];
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--reset-legacy") out.resetLegacy = argv[++i];
    else if (a === "--reset-target") out.resetTarget = argv[++i];
    else out.paths.push(a);
  }
  return out;
}

function scenarioFiles(paths) {
  const files = [];
  for (const p of paths.length ? paths : ["parity/scenarios"]) {
    const st = statSync(p);
    if (st.isDirectory()) {
      for (const f of readdirSync(p).sort()) {
        if (f.endsWith(".json")) files.push(join(p, f));
      }
    } else files.push(p);
  }
  return files;
}

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export function visibleText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code =
          e[1] === "x" || e[1] === "X"
            ? parseInt(e.slice(2), 16)
            : Number(e.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function formFields(html) {
  const names = new Set();
  for (const m of html.matchAll(
    /<(?:input|textarea|select)\b[^>]*\bname\s*=\s*["']([^"']+)["']/gi,
  )) {
    names.add(m[1]);
  }
  return [...names].sort();
}

const BUILTIN_RULES = [
  [/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "<jwt>"],
  [
    /\b\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?\b/g,
    "<timestamp>",
  ],
  [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    "<uuid>",
  ],
];

function normaliser(scenario) {
  const rules = [
    ...BUILTIN_RULES,
    ...(scenario.normalize ?? []).map((r) => [
      new RegExp(r.pattern, "g"),
      r.replace ?? "<normalized>",
    ]),
  ];
  return (s) => rules.reduce((acc, [re, rep]) => acc.replace(re, rep), s);
}

function canonicalJson(value, norm) {
  if (Array.isArray(value)) return value.map((v) => canonicalJson(v, norm));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonicalJson(value[k], norm)]),
    );
  }
  return typeof value === "string" ? norm(value) : value;
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function substitute(value, vars) {
  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (_, k) =>
      k in vars ? String(vars[k]) : `{{${k}}}`,
    );
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]),
    );
  }
  return value;
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  store(headers) {
    const list =
      typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    for (const line of list) {
      const [pair, ...attrs] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq < 1) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      const expired = attrs.some((a) => {
        const [k, v = ""] = a.trim().split("=");
        if (k.toLowerCase() === "max-age") return Number(v) <= 0;
        if (k.toLowerCase() === "expires") return Date.parse(v) < Date.now();
        return false;
      });
      if (expired || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

function locationPath(location, base) {
  if (!location) return null;
  try {
    const u = new URL(location, base);
    const b = new URL(base);
    return u.origin === b.origin ? `${u.pathname}${u.search}` : u.href;
  } catch {
    return location;
  }
}

async function runScenario(base, scenario) {
  const norm = normaliser(scenario);
  const jars = new Map();
  const vars = {};
  const observed = [];
  for (const raw of scenario.steps ?? []) {
    const step = substitute(raw, vars);
    const label = step.session ?? "default";
    if (!jars.has(label)) jars.set(label, new CookieJar());
    const jar = jars.get(label);
    const headers = { ...(step.headers ?? {}) };
    let body;
    if (step.form) {
      body = new URLSearchParams(step.form).toString();
      headers["Content-Type"] ??= "application/x-www-form-urlencoded";
    } else if (step.json !== undefined) {
      body = JSON.stringify(step.json);
      headers["Content-Type"] ??= "application/json";
    } else if (step.body !== undefined) body = step.body;
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
    let res;
    let text = "";
    try {
      res = await fetch(new URL(step.path, base), {
        method: step.method ?? "GET",
        headers,
        body,
        redirect: "manual",
      });
      text = await res.text();
    } catch (error) {
      observed.push({
        name: step.name,
        error: String(error?.cause?.code ?? error?.message ?? error),
      });
      continue;
    }
    jar.store(res.headers);
    const type = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const isRedirect = res.status >= 300 && res.status < 400;
    const view = {
      name: step.name,
      status: res.status,
      location: locationPath(res.headers.get("location"), base),
      // A redirect's own body and type are never shown to anyone.
      type: isRedirect ? null : type || null,
    };
    if (!isRedirect) {
      if (type.includes("json")) {
        try {
          view.json = canonicalJson(JSON.parse(text), norm);
        } catch {
          view.text = norm(text.trim());
        }
      } else if (type.includes("html")) {
        view.text = norm(visibleText(text));
        view.fields = formFields(text);
      } else view.text = norm(text.trim());
    }
    for (const [name, spec] of Object.entries(step.capture ?? {})) {
      let value;
      if (spec.header) value = res.headers.get(spec.header);
      else if (spec.json) {
        try {
          value = getPath(JSON.parse(text), spec.json);
        } catch {
          value = undefined;
        }
      } else if (spec.regex) value = new RegExp(spec.regex).exec(text)?.[1];
      if (value !== undefined && value !== null) vars[name] = value;
    }
    observed.push(view);
  }
  return observed;
}

function diffStep(a, b) {
  const out = [];
  if (a.error)
    return [
      { field: "legacy_unreachable", legacy: a.error, target: b.error ?? null },
    ];
  if (b.error)
    return [{ field: "target_unreachable", legacy: null, target: b.error }];
  for (const f of ["status", "location", "type"]) {
    if (a[f] !== b[f]) out.push({ field: f, legacy: a[f], target: b[f] });
  }
  for (const f of ["text", "json", "fields"]) {
    const x = JSON.stringify(a[f] ?? null);
    const y = JSON.stringify(b[f] ?? null);
    if (x !== y)
      out.push({ field: f, legacy: x.slice(0, 600), target: y.slice(0, 600) });
  }
  return out;
}

async function resetApp(command, base) {
  if (!command) return;
  execSync(command, { stdio: "ignore", shell: true });
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(base, { redirect: "manual" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

/**
 * @param {{ legacy: string, target: string, files: string[],
 *   resetLegacy?: string, resetTarget?: string }} options
 */
export async function replay({
  legacy,
  target,
  files,
  resetLegacy,
  resetTarget,
}) {
  const report = {
    version: VERSION,
    generatedAt: new Date().toISOString(),
    legacy,
    target,
    scenarios: 0,
    total: 0,
    identical: 0,
    legacyDataCases: 0,
    legacyDataIdentical: 0,
    freshData: Boolean(resetLegacy && resetTarget),
    /** @type {{ scenario: string, step: string, field: string, legacy: unknown, target: unknown }[]} */
    differences: [],
  };
  for (const file of files) {
    const scenario = JSON.parse(readFileSync(file, "utf8"));
    report.scenarios += 1;
    await resetApp(resetLegacy, legacy);
    const a = await runScenario(legacy, scenario);
    await resetApp(resetTarget, target);
    const b = await runScenario(target, scenario);
    a.forEach((step, i) => {
      const diffs = diffStep(step, b[i] ?? { error: "missing" });
      report.total += 1;
      if (scenario.legacyData) report.legacyDataCases += 1;
      if (!diffs.length) {
        report.identical += 1;
        if (scenario.legacyData) report.legacyDataIdentical += 1;
      } else {
        for (const d of diffs)
          report.differences.push({
            scenario: scenario.name ?? file,
            step: step.name,
            ...d,
          });
      }
    });
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.legacy || !args.target) {
    console.error(
      "Need --legacy and --target base URLs (or PARITY_LEGACY / PARITY_TARGET).",
    );
    process.exit(2);
  }
  if (
    resolve(args.legacy) === resolve(args.target) ||
    args.legacy === args.target
  ) {
    console.error("--legacy and --target must be two different running apps.");
    process.exit(2);
  }
  const files = scenarioFiles(args.paths);
  const report = await replay({
    legacy: args.legacy,
    target: args.target,
    files,
  });
  mkdirSync(dirname(args.report), { recursive: true });
  writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
  for (const d of report.differences.slice(0, 80)) {
    console.log(
      `DIFF ${d.scenario} > ${d.step} [${d.field}]\n  legacy: ${d.legacy}\n  target: ${d.target}`,
    );
  }
  console.log(
    `\n${report.identical}/${report.total} steps identical across ${report.scenarios} scenario(s); ` +
      `legacy-data steps ${report.legacyDataIdentical}/${report.legacyDataCases}. Report: ${args.report}`,
  );
  process.exit(report.total > 0 && report.identical === report.total ? 0 : 1);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("replay.mjs")
) {
  main().catch((error) => {
    console.error(error);
    process.exit(2);
  });
}
