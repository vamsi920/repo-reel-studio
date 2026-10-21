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
//   "synth": { "sql": "parity/synth/fixture.sql" },   // Neo Synth rows, loaded into
//                                         // every SQLite store after the fixture
//   "rea": { "executable_path": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
//                                         // or { "not_applicable": "<why: e.g. a CLI tool>" }
//   "storeCompare": { "ignoreColumns": ["updated_at"] },   // optional
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
// After every scenario the harness also compares the two SQLite stores table
// by table (same table name and columns on both sides; password/hash/token
// columns compared for presence only): what each app wrote must match, not
// only what it showed. The result is report.store.
//
// REA lane (real browser, evidence by REA: github.com/morluto/rea):
//   node .neome/replay.mjs --rea --apps parity/apps.json parity/browser
// parity/browser/*.json hold REA capture_browser_scenario inputs WITHOUT the
// "browser" key and with {{BASE}} for the app origin, e.g.
// { "name": "login", "start_url": { "url": "{{BASE}}/auth/login" },
//   "actions": [ { "step_id": "user", "action": "fill",
//                  "locator": { "kind": "css", "selector": "input[name=username]" },
//                  "value": { "source": "literal", "value": "alice" } },
//                { "step_id": "go", "action": "click",
//                  "locator": { "kind": "css", "selector": "input[type=submit]" } },
//                { "step_id": "home", "action": "goto",
//                  "destination": { "url": "{{BASE}}/" }, "wait_until": "load" } ] }
// Each scenario is captured against the legacy app and then the new app on
// the SAME port (REA refuses to compare different origins), each started on
// the fresh fixture, and compared with REA's compare-web-captures. Response
// header names are dropped before the comparison (servers differ there and
// users never see them); everything else is REA's verdict. Report:
// .neome/rea-report.json (--characterize: legacy vs itself,
// .neome/rea-characterize-report.json). Captures and evidence ids are kept
// under .neome/rea/.
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
import { execFileSync, execSync, spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
    else if (a === "--rea") out.rea = true;
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
    /\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:?\d\d)?\b/g,
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

async function portAnswers(url) {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(1500) });
    return true;
  } catch (error) {
    // A refused connection means free; a timeout or any HTTP answer means taken.
    return error?.name === "TimeoutError";
  }
}

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
export async function startManagedApp(side, name, { root, fixture, synthSql }) {
  const cwd = resolve(root, side.cwd ?? ".");
  if (side.reset) execSync(side.reset, { cwd, stdio: "ignore", shell: true });
  if (fixture && side.store) {
    const store = resolve(cwd, side.store);
    mkdirSync(dirname(store), { recursive: true });
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      rmSync(`${store}${suffix}`, { force: true });
    }
    copyFileSync(resolve(root, fixture), store);
    if (synthSql && isSqliteStore(store)) {
      // Neo Synth rows, the same ones in both apps, on top of the fixture.
      // -bail: a single failing INSERT must fail the start, not leave a
      // half-loaded store that only looks fresh.
      const load = spawnSync("sqlite3", ["-bail", store], {
        input: readFileSync(resolve(root, synthSql)),
        encoding: "utf8",
      });
      if (load.status !== 0) {
        throw new Error(
          `loading ${synthSql} into ${side.store} failed: ${(load.stderr || "").trim().split("\n")[0]}`,
        );
      }
    }
  }
  const port = new URL(side.url).port;
  // A port something else already answers on would make the harness measure
  // that other server (seen with the Neo dev stack on 8000) and call it parity.
  if (port && (await portAnswers(side.url))) {
    throw new Error(
      `${side.url} already answers before ${name} was started: another process owns port ${port}. Pick a free port in apps.json.`,
    );
  }
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
const APP_KEYS = [
  "fixture",
  "legacy",
  "target",
  "synth",
  "rea",
  "storeCompare",
];
const SQLITE_SUFFIXES = [".sqlite", ".sqlite3", ".db"];

export function isSqliteStore(path) {
  return (
    Boolean(path) && SQLITE_SUFFIXES.some((s) => path.toLowerCase().endsWith(s))
  );
}
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
    if (!APP_KEYS.includes(key)) {
      errors.push(
        `apps.json: unknown key "${key}" (use ${APP_KEYS.map((k) => `"${k}"`).join(", ")})`,
      );
    }
  }
  if (apps.synth !== undefined) {
    if (typeof apps.synth?.sql !== "string") {
      errors.push(
        'apps.json: "synth" must be { "sql": "<path to the Neo Synth SQL file>" }',
      );
    } else if (!apps.fixture) {
      errors.push(
        'apps.json: "synth" needs a "fixture" store to load the rows into',
      );
    }
  }
  if (apps.rea !== undefined) {
    const rea = apps.rea;
    const ok =
      rea &&
      typeof rea === "object" &&
      (typeof rea.not_applicable === "string"
        ? rea.not_applicable.trim().length > 0
        : typeof rea.executable_path === "string" &&
          rea.executable_path.startsWith("/"));
    if (
      ok &&
      typeof rea.not_applicable === "string" &&
      typeof apps.legacy?.url === "string" &&
      /^https?:\/\//.test(apps.legacy.url)
    ) {
      errors.push(
        'apps.json: "rea": {"not_applicable"} is only for apps with no HTTP surface (CLI tools, libraries). This app answers HTTP, so browsers reach it: set "rea": {"executable_path": "<absolute path to Chrome/Chromium>"} and add parity/browser scenarios.',
      );
    }
    if (!ok) {
      errors.push(
        'apps.json: "rea" must be { "executable_path": "<absolute path to Chrome/Chromium>" } (optional "command") or { "not_applicable": "<reason>" }',
      );
    }
  }
  if (apps.storeCompare !== undefined) {
    const sc = apps.storeCompare;
    if (!sc || typeof sc !== "object" || Array.isArray(sc)) {
      errors.push(
        'apps.json: "storeCompare" must be an object { "ignoreColumns"?: [..], "tableMap"?: {..} }',
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
  for (const key of Object.keys(scenario)) {
    if (
      !["name", "legacyData", "synthData", "normalize", "steps"].includes(key)
    ) {
      errors.push(
        `${file}: unknown key "${key}" (allowed: name, legacyData, synthData, normalize, steps)`,
      );
    }
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

const SECRET_COLUMN = /password|passwd|hash|token|secret|salt/i;

function sqliteJson(store, sql) {
  const out = execFileSync("sqlite3", ["-json", store, sql], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? JSON.parse(out) : [];
}

/** Every ordinary table of a SQLite store with its columns and rows. */
export function snapshotSqlite(store) {
  const tables = {};
  const names = sqliteJson(
    store,
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
  ).map((r) => r.name);
  for (const name of names) {
    const columns = sqliteJson(
      store,
      `pragma table_info("${name.replace(/"/g, '""')}")`,
    ).map((c) => c.name);
    const rows = sqliteJson(
      store,
      `select * from "${name.replace(/"/g, '""')}"`,
    );
    tables[name] = { columns, rows };
  }
  return tables;
}

/**
 * Table-by-table comparison of what the two apps wrote. Only tables present
 * on both sides with the same column set are compared (others are listed as
 * skipped); secret-like columns count as present/absent only; rows are
 * normalised and compared as unordered sets.
 */
/**
 * @param {Record<string, { columns: string[], rows: Record<string, unknown>[] }>} legacy
 * @param {Record<string, { columns: string[], rows: Record<string, unknown>[] }>} target
 * @param {{ norm?: (s: string) => string, ignoreColumns?: string[], tableMap?: Record<string, string> }} [options]
 */
export function compareStores(
  legacy,
  target,
  { norm = (v) => v, ignoreColumns = [], tableMap = {} } = {},
) {
  const result = { compared: 0, identical: 0, skipped: [], differences: [] };
  for (const [name, left] of Object.entries(legacy)) {
    const targetName = tableMap[name] ?? name;
    const right = target[targetName];
    if (!right) {
      result.skipped.push({ table: name, reason: "missing_in_target" });
      continue;
    }
    const cols = left.columns.filter((c) => !ignoreColumns.includes(c));
    const rcols = right.columns.filter((c) => !ignoreColumns.includes(c));
    if ([...cols].sort().join(",") !== [...rcols].sort().join(",")) {
      result.skipped.push({
        table: name,
        reason: `columns differ: legacy [${cols.join(", ")}] target [${rcols.join(", ")}]`,
      });
      continue;
    }
    const canon = (rows) =>
      rows
        .map((row) =>
          JSON.stringify(
            Object.fromEntries(
              cols.sort().map((c) => {
                const v = row[c];
                if (SECRET_COLUMN.test(c))
                  return [c, v == null || v === "" ? null : "<secret>"];
                return [c, typeof v === "string" ? norm(v) : v];
              }),
            ),
          ),
        )
        .sort();
    const a = canon(left.rows);
    const b = canon(right.rows);
    result.compared += 1;
    if (a.length === b.length && a.every((row, i) => row === b[i])) {
      result.identical += 1;
    } else {
      const onlyLegacy = a.filter((r) => !b.includes(r)).slice(0, 3);
      const onlyTarget = b.filter((r) => !a.includes(r)).slice(0, 3);
      result.differences.push({
        table: name,
        legacyRows: a.length,
        targetRows: b.length,
        onlyLegacy,
        onlyTarget,
      });
    }
  }
  return result;
}

/**
 * Replays scenarios with both apps started fresh by the harness for every
 * scenario (see the header). `apps` is the parsed parity/apps.json.
 */
export async function replayManaged({ apps, files, root = process.cwd() }) {
  const errors = validateApps(apps);
  if (errors.length) throw new Error(errors.join("\n"));
  const shared = { root, fixture: apps.fixture, synthSql: apps.synth?.sql };
  const sides = { legacy: apps.legacy, target: apps.target };
  const storePath = (side) =>
    side.store ? resolve(root, side.cwd ?? ".", side.store) : null;
  const storesComparable =
    isSqliteStore(storePath(sides.legacy)) &&
    isSqliteStore(storePath(sides.target));
  const snapshots = {};
  const store = {
    applicable: storesComparable,
    compared: 0,
    identical: 0,
    skipped: [],
    differences: [],
  };
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
        const steps = await run();
        if (storesComparable) {
          try {
            snapshots[which] = snapshotSqlite(storePath(sides[which]));
          } catch (error) {
            snapshots[which] = { error: String(error?.message ?? error) };
          }
        }
        return steps;
      } finally {
        await stop();
      }
    },
    afterScenario: (scenario, norm) => {
      if (!storesComparable) return;
      const a = snapshots.legacy;
      const b = snapshots.target;
      if (!a || !b || a.error || b.error) {
        store.differences.push({
          scenario: scenario.name,
          table: "*",
          error: a?.error ?? b?.error ?? "no snapshot",
        });
        return;
      }
      const r = compareStores(a, b, {
        norm,
        ignoreColumns: apps.storeCompare?.ignoreColumns ?? [],
        tableMap: apps.storeCompare?.tableMap ?? {},
      });
      store.compared += r.compared;
      store.identical += r.identical;
      for (const sk of r.skipped) {
        if (!store.skipped.some((x) => x.table === sk.table))
          store.skipped.push(sk);
      }
      for (const d of r.differences)
        store.differences.push({ scenario: scenario.name, ...d });
    },
    freshData: true,
    synthApplied: Boolean(apps.synth?.sql && apps.fixture),
    store,
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
  afterScenario,
  synthApplied,
  store,
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
    synthDataCases: 0,
    synthDataIdentical: 0,
    synthApplied: Boolean(synthApplied),
    kind: "replay",
    /** Status codes the legacy app answered with, e.g. { "200": 9, "404": 2 }. */
    legacyStatuses: {},
    freshData: freshData ?? Boolean(resetLegacy && resetTarget),
    managedApps: Boolean(around),
    store: store ?? {
      applicable: false,
      compared: 0,
      identical: 0,
      skipped: [],
      differences: [],
    },
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
    for (const step of steps) {
      if (typeof step.status === "number") {
        const key = String(step.status);
        report.legacyStatuses[key] = (report.legacyStatuses[key] ?? 0) + 1;
      }
    }
    steps.forEach((step, i) => {
      const diffs = diffStep(step, other[i]);
      report.total += 1;
      if (scenario.legacyData) report.legacyDataCases += 1;
      if (scenario.synthData) report.synthDataCases += 1;
      if (!diffs.length) {
        report.identical += 1;
        if (scenario.legacyData) report.legacyDataIdentical += 1;
        if (scenario.synthData) report.synthDataIdentical += 1;
      } else {
        for (const d of diffs)
          report.differences.push({
            scenario: scenario.name ?? file,
            step: step.name,
            ...d,
          });
      }
    });
    afterScenario?.(scenario, normaliser(scenario));
  }
  return report;
}

/* ───────────────────────────── REA lane ───────────────────────────── */

const REA_DEFAULT_CAPTURE = {
  at_end: ["dom", "url", "screenshot"],
  events: ["console", "page-errors", "network"],
};
const BROWSER_SCENARIO_KEYS = [
  "name",
  "start_url",
  "actions",
  "environment",
  "storage",
  "secrets",
  "capture",
];

/** The REA command for this machine: apps.rea.command, `rea` on PATH, or npx. */
export function resolveReaCommand(rea) {
  if (rea?.command) return rea.command;
  const probe = spawnSync("rea", ["--help"], { stdio: "ignore", shell: true });
  if (probe.status === 0) return "rea";
  return "npx -y rea-agents@6.7.0";
}

function runRea(command, args, { cwd, timeoutMs = 10 * 60 * 1000 }) {
  const r = spawnSync(`${command} ${args.map((a) => `"${a}"`).join(" ")}`, {
    cwd,
    shell: true,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
  });
  const text = (r.stdout ?? "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.error || parsed.code) {
    const message =
      parsed?.message ??
      (r.stderr ?? "").trim().split("\n").slice(-3).join(" ") ??
      "REA failed";
    const issues = parsed?.details?.issues
      ? ` ${JSON.stringify(parsed.details.issues).slice(0, 600)}`
      : "";
    throw new Error(`rea ${args[0]}: ${message}${issues}`);
  }
  return parsed;
}

/** Problems with one parity/browser scenario file. */
export function validateBrowserScenario(scenario, file) {
  const errors = [];
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
    return [
      `${file}: a browser scenario is an object { "name", "start_url", "actions" }`,
    ];
  }
  for (const key of Object.keys(scenario)) {
    if (!BROWSER_SCENARIO_KEYS.includes(key)) {
      errors.push(
        `${file}: unknown key "${key}" (allowed: ${BROWSER_SCENARIO_KEYS.join(", ")}); the harness adds "browser" itself`,
      );
    }
  }
  const url = scenario.start_url?.url;
  if (typeof url !== "string" || !url.startsWith("{{BASE}}")) {
    errors.push(
      `${file}: start_url.url must start with {{BASE}} (the app origin)`,
    );
  }
  if (!Array.isArray(scenario.actions) || scenario.actions.length === 0) {
    errors.push(
      `${file}: "actions" must be a non-empty list of REA browser actions`,
    );
  } else {
    scenario.actions.forEach((a, i) => {
      if (typeof a?.step_id !== "string" || typeof a?.action !== "string") {
        errors.push(`${file} action ${i + 1}: needs "step_id" and "action"`);
      }
      const dest = a?.destination?.url;
      if (
        a?.action === "goto" &&
        (typeof dest !== "string" || !dest.startsWith("{{BASE}}"))
      ) {
        errors.push(
          `${file} action ${i + 1}: goto destination.url must start with {{BASE}}`,
        );
      }
    });
  }
  return errors;
}

function loadBrowserScenarios(files) {
  const errors = [];
  const out = files.map((file) => {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8"));
    } catch (error) {
      errors.push(`${file}: not valid JSON (${error.message})`);
      return null;
    }
    errors.push(...validateBrowserScenario(parsed, file));
    return parsed;
  });
  if (!files.length)
    errors.push("no browser scenario files found (parity/browser/*.json)");
  if (errors.length) throw new Error(errors.join("\n"));
  return out;
}

function substituteBase(value, base) {
  if (typeof value === "string") return value.split("{{BASE}}").join(base);
  if (Array.isArray(value)) return value.map((v) => substituteBase(v, base));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substituteBase(v, base)]),
    );
  }
  return value;
}

/**
 * Servers differ in response header names (Werkzeug vs Express) and nobody
 * sees them; everything else in the capture stays REA's own. Recorded in the
 * report as harnessNormalization.
 */
export function stripResponseHeaderNames(normalized) {
  const copy = JSON.parse(JSON.stringify(normalized));
  for (const item of copy?.events?.items ?? []) {
    if (item.kind === "response" && Array.isArray(item.header_names)) {
      item.header_names = [];
    }
  }
  return copy;
}

async function captureSide(
  side,
  which,
  { shared, rea, scenario, name, port, outDir },
) {
  const url = new URL(side.url);
  url.port = String(port);
  const base = url.origin;
  const started = await startManagedApp({ ...side, url: base }, which, shared);
  try {
    const input = {
      ...substituteBase(
        Object.fromEntries(
          Object.entries(scenario).filter(([k]) => k !== "name"),
        ),
        base,
      ),
      browser: {
        mode: "launch",
        executable_path: rea.executable_path,
        headless: true,
      },
      capture: scenario.capture ?? REA_DEFAULT_CAPTURE,
    };
    const tmp = join(
      tmpdir(),
      `neome-rea-${process.pid}-${name}-${which}.json`,
    );
    writeFileSync(tmp, JSON.stringify(input));
    try {
      const evidence = runRea(
        rea.command,
        ["capture-browser-scenario", tmp, "--format", "json"],
        {
          cwd: shared.root,
        },
      );
      writeFileSync(
        join(outDir, `${name}-${which}.evidence.json`),
        `${JSON.stringify(evidence)}\n`,
      );
      const normalized = stripResponseHeaderNames(evidence.normalized_result);
      const normalizedPath = join(outDir, `${name}-${which}.json`);
      writeFileSync(normalizedPath, `${JSON.stringify(normalized)}\n`);
      return {
        evidenceId: evidence.evidence_id,
        normalizedPath,
        completeness: normalized.completeness,
      };
    } finally {
      rmSync(tmp, { force: true });
    }
  } finally {
    await started();
  }
}

/**
 * Captures every parity/browser scenario with REA against the legacy app and
 * the target (or the legacy app again, for characterization) on the same
 * port, and compares them with REA.
 */
export async function reaLane({
  apps,
  files,
  root = process.cwd(),
  characterize: selfCheck = false,
}) {
  const errors = validateApps(apps, { needTarget: !selfCheck });
  if (errors.length) throw new Error(errors.join("\n"));
  if (!apps.rea || apps.rea.not_applicable) {
    throw new Error(
      'apps.json: the REA lane needs "rea": { "executable_path": "<Chrome/Chromium>" }',
    );
  }
  const rea = { ...apps.rea, command: resolveReaCommand(apps.rea) };
  const scenarios = loadBrowserScenarios(files);
  const shared = { root, fixture: apps.fixture, synthSql: apps.synth?.sql };
  const outDir = resolve(root, ".neome/rea");
  mkdirSync(outDir, { recursive: true });
  const port = new URL(apps.legacy.url).port || "80";
  /** @type {{ version: number, kind: string, generatedAt: string, tool: string, legacy: string, target: string | null, scenarios: number, unchanged: number, freshData: boolean, synthApplied: boolean, harnessNormalization: string[], results: { scenario: string, status: string, error?: string, alignment?: unknown, evidence: Record<string, string>, changed: { step: string | null, artifact: string, status: string, reason?: string | null }[] }[] }} */
  const report = {
    version: VERSION,
    kind: selfCheck ? "rea-characterize" : "rea",
    generatedAt: new Date().toISOString(),
    tool: rea.command,
    legacy: apps.legacy.url,
    target: selfCheck ? null : apps.target.url,
    scenarios: 0,
    unchanged: 0,
    freshData: Boolean(apps.fixture),
    synthApplied: Boolean(apps.synth?.sql && apps.fixture),
    harnessNormalization: ["drop_response_header_names"],
    results: [],
  };
  for (const [index, file] of files.entries()) {
    const scenario = scenarios[index];
    const name = (scenario.name ?? file).replace(/[^\w.-]+/g, "_");
    report.scenarios += 1;
    /** @type {(typeof report.results)[number]} */
    const entry = {
      scenario: scenario.name ?? file,
      status: "error",
      changed: [],
      evidence: {},
    };
    try {
      const left = await captureSide(apps.legacy, "legacy", {
        shared,
        rea,
        scenario,
        name,
        port,
        outDir,
      });
      const rightSide = selfCheck ? apps.legacy : apps.target;
      const right = await captureSide(
        rightSide,
        selfCheck ? "legacy2" : "target",
        { shared, rea, scenario, name, port, outDir },
      );
      entry.evidence = { legacy: left.evidenceId, target: right.evidenceId };
      const compare = runRea(
        rea.command,
        [
          "compare-web-captures",
          left.normalizedPath,
          right.normalizedPath,
          "--format",
          "json",
        ],
        { cwd: root },
      );
      writeFileSync(
        join(outDir, `${name}-compare.json`),
        `${JSON.stringify(compare)}\n`,
      );
      entry.evidence.compare = compare.evidence_id;
      const verdict = compare.normalized_result;
      entry.status = verdict.overall_status;
      entry.alignment = verdict.alignment;
      for (const step of verdict.steps ?? []) {
        for (const diff of step.artifact_diffs ?? []) {
          if (diff.status !== "unchanged") {
            entry.changed.push({
              step: step.step_id,
              artifact: diff.artifact,
              status: diff.status,
              reason: diff.reason,
            });
          }
        }
      }
      for (const f of verdict.alignment?.failures ?? []) {
        entry.changed.push({
          step: f.step_id,
          artifact: "alignment",
          status: f.code,
          reason: f.reason,
        });
      }
      if (entry.status === "unchanged") report.unchanged += 1;
    } catch (error) {
      entry.error = String(error?.message ?? error);
    }
    report.results.push(entry);
  }
  return report;
}

function finishRea(report, reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const r of report.results) {
    const head = `${r.status.toUpperCase().padEnd(9)} ${r.scenario}`;
    console.log(r.error ? `${head}\n  ${r.error}` : head);
    for (const c of r.changed.slice(0, 20)) {
      console.log(
        `  ${c.step ?? "-"} [${c.artifact}] ${c.status}${c.reason ? `: ${c.reason}` : ""}`,
      );
    }
  }
  console.log(
    `\n${report.unchanged}/${report.scenarios} browser scenario(s) unchanged under REA. Report: ${reportPath}`,
  );
  process.exit(
    report.scenarios > 0 && report.unchanged === report.scenarios ? 0 : 1,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.apps && !args.legacy && existsSync("parity/apps.json")) {
    args.apps = "parity/apps.json";
  }
  if (args.rea) {
    const apps = JSON.parse(
      readFileSync(args.apps ?? "parity/apps.json", "utf8"),
    );
    const files = scenarioFiles(
      args.paths.length ? args.paths : ["parity/browser"],
    );
    const report = await reaLane({
      apps,
      files,
      characterize: Boolean(args.characterize),
    });
    return finishRea(
      report,
      args.report === ".neome/replay-report.json"
        ? args.characterize
          ? ".neome/rea-characterize-report.json"
          : ".neome/rea-report.json"
        : args.report,
    );
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
  for (const d of (report.store?.differences ?? []).slice(0, 20)) {
    console.log(
      `STORE DIFF ${d.scenario} > ${d.table}: ${d.error ?? `legacy ${d.legacyRows} rows, target ${d.targetRows} rows`}`,
    );
    for (const r of d.onlyLegacy ?? [])
      console.log(`  only legacy: ${r.slice(0, 300)}`);
    for (const r of d.onlyTarget ?? [])
      console.log(`  only target: ${r.slice(0, 300)}`);
  }
  const store = report.store?.applicable
    ? `; store tables identical ${report.store.identical}/${report.store.compared}` +
      (report.store.skipped.length
        ? ` (skipped: ${report.store.skipped.map((s) => s.table).join(", ")})`
        : "")
    : "";
  console.log(
    `\n${report.identical}/${report.total} steps identical across ${report.scenarios} scenario(s); ` +
      `legacy-data steps ${report.legacyDataIdentical}/${report.legacyDataCases}; synth-data steps ${report.synthDataIdentical}/${report.synthDataCases}${store}. Report: ${args.report}`,
  );
  const storeOk =
    !report.store?.applicable ||
    report.store.identical === report.store.compared;
  process.exit(
    report.total > 0 && report.identical === report.total && storeOk ? 0 : 1,
  );
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
