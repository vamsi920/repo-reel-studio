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
// Usage (preferred): let the harness run both apps.
//   node .neome/replay.mjs --apps parity/apps.json parity/scenarios
// parity/apps.json:
// {
//   "fixture": "parity/fixture.sqlite",   // optional: copied into each "store"
//   "legacy": { "cwd": ".", "start": ".venv/bin/flask --app flaskr run --port 5911",
//               "url": "http://127.0.0.1:5911", "store": "instance/flaskr.sqlite" },
//   "target": { "cwd": "express-app", "start": "node index.js",
//               "url": "http://127.0.0.1:5912", "store": "data/flaskr.sqlite",
//               "env": { "DB_PATH": "data/flaskr.sqlite" } }
// }
// Before EVERY scenario the harness, for each app: runs its optional "reset"
// command, copies the fixture over its "store" (removing -wal/-shm files),
// starts it with PORT set from its url (plus "env"), waits until the url
// answers (optional "readyPath"), replays the steps, then stops exactly that
// process group. Every scenario therefore starts from the same fresh data in
// both apps, and no app is left running. Logs: .neome/logs/<legacy|target>.log
//
// First, before any migration code exists, characterize the legacy app:
//   node .neome/replay.mjs --characterize --apps parity/apps.json parity/scenarios
// replays every scenario twice against the legacy app alone (fresh fixture
// each time) and writes .neome/characterize-report.json; both runs must be
// identical (otherwise a scenario or the fixture is non-deterministic).
//
// Or point it at apps you run yourself (you must then reset both apps to the
// same data before every scenario, e.g. by restarting them):
//   node .neome/replay.mjs --legacy http://127.0.0.1:5000 \
//     --target http://127.0.0.1:3000 \
//     --reset-legacy "<restore fixture + restart>" \
//     --reset-target "<restore fixture + restart>" parity/scenarios
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
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execSync, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const VERSION = 1;

function parseArgs(argv) {
  const out = {
    legacy: process.env.PARITY_LEGACY,
    target: process.env.PARITY_TARGET,
    report: ".neome/replay-report.json",
    resetLegacy: process.env.PARITY_RESET_LEGACY,
    resetTarget: process.env.PARITY_RESET_TARGET,
    apps: undefined,
    paths: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--legacy") out.legacy = argv[++i];
    else if (a === "--target") out.target = argv[++i];
    else if (a === "--report") out.report = argv[++i];
    else if (a === "--reset-legacy") out.resetLegacy = argv[++i];
    else if (a === "--reset-target") out.resetTarget = argv[++i];
    else if (a === "--apps") out.apps = argv[++i];
    else if (a === "--characterize") out.characterize = true;
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

const sleep = (ms) =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

async function waitUntilAnswers(url, child) {
  for (let i = 0; i < 120; i += 1) {
    if (child && child.exitCode !== null) {
      throw new Error(
        `app exited with code ${child.exitCode} before answering`,
      );
    }
    try {
      await fetch(url, { redirect: "manual" });
      return;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`no answer from ${url} within 60s`);
}

/** Starts one side of apps.json on fresh data; returns a stop function. */
export async function startManagedApp(side, name, { root, fixture }) {
  const cwd = resolve(root, side.cwd ?? ".");
  if (side.reset) execSync(side.reset, { cwd, stdio: "ignore", shell: true });
  if (fixture && side.store) {
    const store = resolve(cwd, side.store);
    mkdirSync(dirname(store), { recursive: true });
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      rmSync(`${store}${suffix}`, { force: true });
    }
    copyFileSync(resolve(root, fixture), store);
  }
  const port = new URL(side.url).port;
  mkdirSync(resolve(root, ".neome/logs"), { recursive: true });
  const log = createWriteStream(resolve(root, `.neome/logs/${name}.log`), {
    flags: "a",
  });
  const child = spawn(side.start, {
    cwd,
    shell: true,
    detached: true,
    env: {
      ...process.env,
      ...(port ? { PORT: port } : {}),
      ...(side.env ?? {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const stop = async () => {
    if (child.exitCode !== null) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      return;
    }
    for (let i = 0; i < 20 && child.exitCode === null; i += 1) await sleep(250);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // already gone
    }
  };
  try {
    await waitUntilAnswers(
      new URL(side.readyPath ?? "/", side.url).href,
      child,
    );
  } catch (error) {
    await stop();
    throw error;
  }
  return stop;
}

const SIDE_KEYS = ["cwd", "start", "url", "store", "env", "reset", "readyPath"];
const STEP_KEYS = [
  "name",
  "session",
  "method",
  "path",
  "form",
  "json",
  "body",
  "headers",
  "capture",
];

/** Problems with parity/apps.json, in words that say how to fix them. */
export function validateApps(apps, { needTarget = true } = {}) {
  const errors = [];
  if (!apps || typeof apps !== "object" || Array.isArray(apps)) {
    return [
      'apps.json must be an object: { "fixture"?, "legacy": {...}, "target": {...} }',
    ];
  }
  for (const key of Object.keys(apps)) {
    if (!["fixture", "legacy", "target"].includes(key)) {
      errors.push(
        `apps.json: unknown key "${key}" (use "fixture", "legacy", "target")`,
      );
    }
  }
  for (const name of needTarget ? ["legacy", "target"] : ["legacy"]) {
    const side = apps[name];
    if (!side || typeof side !== "object") {
      errors.push(`apps.json: missing "${name}" app`);
      continue;
    }
    for (const key of Object.keys(side)) {
      if (!SIDE_KEYS.includes(key)) {
        errors.push(
          `apps.json ${name}: unknown key "${key}" (allowed: ${SIDE_KEYS.join(", ")})`,
        );
      }
    }
    if (typeof side.start !== "string")
      errors.push(`apps.json ${name}: "start" (shell command) is required`);
    if (typeof side.url !== "string" || !/^https?:\/\//.test(side.url)) {
      errors.push(
        `apps.json ${name}: "url" (e.g. "http://127.0.0.1:5911") is required`,
      );
    }
  }
  if (apps.fixture && typeof apps.fixture !== "string") {
    errors.push('apps.json: "fixture" must be a path');
  }
  return errors;
}

/** Problems with one scenario file. */
export function validateScenario(scenario, file) {
  const errors = [];
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return [
      `${file}: a scenario is an object { "name", "steps": [...] }, not ${Array.isArray(scenario) ? "a list" : typeof scenario}`,
    ];
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    errors.push(`${file}: "steps" must be a non-empty list`);
    return errors;
  }
  scenario.steps.forEach((step, i) => {
    if (!step || typeof step !== "object") {
      errors.push(`${file} step ${i + 1}: must be an object`);
      return;
    }
    for (const key of Object.keys(step)) {
      if (!STEP_KEYS.includes(key)) {
        errors.push(
          `${file} step ${i + 1}: unknown key "${key}" (allowed: ${STEP_KEYS.join(", ")})`,
        );
      }
    }
    if (typeof step.name !== "string")
      errors.push(`${file} step ${i + 1}: "name" is required`);
    if (typeof step.path !== "string" || !step.path.startsWith("/")) {
      errors.push(`${file} step ${i + 1}: "path" must start with "/"`);
    }
  });
  return errors;
}

function loadScenarios(files) {
  const errors = [];
  const scenarios = files.map((file) => {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${file}: not valid JSON (${error.message})`);
      return null;
    }
    errors.push(...validateScenario(parsed, file));
    return parsed;
  });
  if (!files.length) errors.push("no scenario files found");
  if (errors.length) throw new Error(errors.join("\n"));
  return scenarios;
}

/**
 * Characterization: every scenario twice against the LEGACY app alone, each
 * time on the fresh fixture. Identical runs prove the scenarios exercise the
 * legacy app deterministically before any migration code exists.
 */
export async function characterize({ apps, files, root = process.cwd() }) {
  const errors = validateApps(apps, { needTarget: false });
  if (errors.length) throw new Error(errors.join("\n"));
  const report = await replayManaged({
    apps: { ...apps, target: apps.legacy },
    files,
    root,
  });
  return { ...report, kind: "characterize", target: null };
}

/**
 * Replays scenarios with both apps started fresh by the harness for every
 * scenario (see the header). `apps` is the parsed parity/apps.json.
 */
export async function replayManaged({ apps, files, root = process.cwd() }) {
  const errors = validateApps(apps);
  if (errors.length) throw new Error(errors.join("\n"));
  const shared = { root, fixture: apps.fixture };
  const sides = { legacy: apps.legacy, target: apps.target };
  return replay({
    legacy: apps.legacy.url,
    target: apps.target.url,
    files,
    around: async (which, run) => {
      let stop = async () => {};
      try {
        stop = await startManagedApp(sides[which], which, shared);
      } catch (error) {
        return [{ name: "start", error: String(error?.message ?? error) }];
      }
      try {
        return await run();
      } finally {
        await stop();
      }
    },
    freshData: true,
  });
}

/**
 * @param {{ legacy: string, target: string, files: string[],
 *   resetLegacy?: string, resetTarget?: string,
 *   around?: (which: "legacy" | "target", run: () => Promise<any[]>) => Promise<any[]>,
 *   freshData?: boolean }} options
 */
export async function replay({
  legacy,
  target,
  files,
  resetLegacy,
  resetTarget,
  around,
  freshData,
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
    kind: "replay",
    freshData: freshData ?? Boolean(resetLegacy && resetTarget),
    managedApps: Boolean(around),
    /** @type {{ scenario: string, step: string, field: string, legacy: unknown, target: unknown }[]} */
    differences: [],
  };
  const scenarios = loadScenarios(files);
  for (const [index, file] of files.entries()) {
    const scenario = scenarios[index];
    report.scenarios += 1;
    const wrap = around ?? ((_which, run) => run());
    const a = await wrap("legacy", async () => {
      await resetApp(resetLegacy, legacy);
      return runScenario(legacy, scenario);
    });
    const b = await wrap("target", async () => {
      await resetApp(resetTarget, target);
      return runScenario(target, scenario);
    });
    // A failed start yields one {name: "start", error} entry: every step of
    // that app then counts as unreachable.
    const align = (observed) => {
      const failed =
        observed.length === 1 && observed[0].name === "start"
          ? observed[0].error
          : null;
      return (scenario.steps ?? []).map((st, i) =>
        failed
          ? { name: st.name, error: failed }
          : (observed[i] ?? { name: st.name, error: "missing" }),
      );
    };
    const steps = align(a);
    const other = align(b);
    steps.forEach((step, i) => {
      const diffs = diffStep(step, other[i]);
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
  if (!args.apps && !args.legacy && existsSync("parity/apps.json")) {
    args.apps = "parity/apps.json";
  }
  if (args.characterize) {
    const apps = JSON.parse(
      readFileSync(args.apps ?? "parity/apps.json", "utf8"),
    );
    const files = scenarioFiles(args.paths);
    const report = await characterize({ apps, files });
    return finish(
      report,
      args.report === ".neome/replay-report.json"
        ? ".neome/characterize-report.json"
        : args.report,
    );
  }
  if (args.apps) {
    const apps = JSON.parse(readFileSync(args.apps, "utf8"));
    const files = scenarioFiles(args.paths);
    const report = await replayManaged({ apps, files });
    return finish(report, args.report);
  }
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
    resetLegacy: args.resetLegacy,
    resetTarget: args.resetTarget,
  });
  return finish(report, args.report);
}

function finish(report, reportPath) {
  const args = { report: reportPath };
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
    console.error(error?.message ?? error);
    process.exit(2);
  });
}
