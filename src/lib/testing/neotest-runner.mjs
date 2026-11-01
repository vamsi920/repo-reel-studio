#!/usr/bin/env node
// Neo Test harness. Installed by Neo Test at .neotest/run.mjs; do not edit --
// Neo Test rewrites it and reads the files it writes.
//
// Runs the suites of a plan, each in its own process group with a timeout,
// copies the result files each suite declares into
// .neotest/runs/<run id>/artifacts/<suite id>/ and writes
// .neotest/runs/<run id>/status.json PROGRESSIVELY (after every suite), so a
// studio that polls it sees progress and a reload loses nothing. Parsing the
// artifacts (JUnit, coverage, k6, axe, ...) is the studio's job.
//
// Usage:
//   node .neotest/run.mjs --plan .neotest/plan.json --run <id> [--suites a,b]
//   node .neotest/run.mjs --plan .neotest/plan.json --run <id> --mutate src/x.js --suite unit [--max-mutants 6]
//
// .neotest/plan.json:
// {
//   "suites": [{
//     "id": "unit", "kind": "unit", "name": "Vitest",
//     "command": "npx vitest run --reporter=junit --outputFile=.neotest/results/junit.xml",
//     "cwd": ".", "env": {"CI": "1"}, "timeoutSec": 900,
//     "setup": "npm ci", "teardown": "docker compose down",
//     "results": [{"path": ".neotest/results/junit.xml", "format": "junit"}]
//   }]
// }
//
// The mutation mode is a cheap proof that a suite detects bugs: it applies
// small operator mutants to ONE source file (one at a time, the original is
// always restored, even on crash), runs the suite after each, and records in
// .neotest/runs/<run id>/mutation.json which mutants the suite killed
// (non-zero exit code). Dependency-free: node: builtins only.

import { execFileSync, spawn } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const STATUS_VERSION = 1;
const DEFAULT_TIMEOUT_SEC = 1800;
const TAIL_CHARS = 4000;

export function parseArgs(argv) {
  const args = {
    plan: ".neotest/plan.json",
    run: null,
    suites: null,
    mutate: null,
    suite: null,
    maxMutants: 6,
    root: process.cwd(),
    retries: 0,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[(i += 1)];
    if (a === "--plan") args.plan = next();
    else if (a === "--run") args.run = next();
    else if (a === "--suites")
      args.suites = next()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === "--mutate") args.mutate = next();
    else if (a === "--suite") args.suite = next();
    else if (a === "--max-mutants") args.maxMutants = Number(next()) || 6;
    else if (a === "--root") args.root = resolve(next());
    else if (a === "--retries") args.retries = Number(next()) || 0;
  }
  if (!args.run)
    args.run = `run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  return args;
}

function nowIso() {
  return new Date().toISOString();
}

function tail(text) {
  return text.length > TAIL_CHARS ? text.slice(-TAIL_CHARS) : text;
}

function gitInfo(root) {
  const run = (cmd) => {
    try {
      return execFileSync("git", cmd, {
        cwd: root,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim();
    } catch {
      return undefined;
    }
  };
  // Hash of the WORKING TREE (tracked + untracked, minus ignored): two
  // runs with the same treeHash ran the same code even when nothing was
  // committed in between, which is what flaky detection needs to know.
  let treeHash;
  try {
    const index = join(tmpdir(), `neotest-index-${process.pid}`);
    const env = { ...process.env, GIT_INDEX_FILE: index };
    execFileSync("git", ["add", "-A", "."], {
      cwd: root,
      env,
      stdio: "ignore",
    });
    treeHash = execFileSync("git", ["write-tree"], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    try {
      unlinkSync(index);
    } catch {
      // temp index already gone
    }
  } catch {
    treeHash = undefined;
  }
  return {
    commit: run(["rev-parse", "HEAD"]),
    branch: run(["rev-parse", "--abbrev-ref", "HEAD"]),
    treeHash,
  };
}

/**
 * Runs one shell command in its own process group; kills the whole group on
 * timeout. Resolves (never rejects) with exit code, duration and output tails.
 */
export function runCommand(command, { cwd, env, timeoutSec, onOutput } = {}) {
  return new Promise((resolveRun) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const child = spawn(command, {
      cwd,
      env: { ...process.env, ...(env ?? {}) },
      shell: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(
      () => {
        timedOut = true;
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          // already gone
        }
      },
      (timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000,
    );
    child.stdout.on("data", (d) => {
      stdout = tail(stdout + d.toString());
      onOutput?.(d.toString());
    });
    child.stderr.on("data", (d) => {
      stderr = tail(stderr + d.toString());
      onOutput?.(d.toString());
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: null,
        error: error.message,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

/** Expands a simple `*` glob in the last path segment only (TEST-*.xml). */
export function expandResultPath(root, path) {
  if (!path.includes("*")) return [path];
  const dir = dirname(path);
  const pattern = basename(path);
  const re = new RegExp(
    `^${pattern
      .split("*")
      .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*")}$`,
  );
  try {
    return readdirSafe(join(root, dir))
      .filter((f) => re.test(f))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function readdirSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function collectArtifacts(root, runDir, suite) {
  const out = [];
  const targetDir = join(runDir, "artifacts", suite.id);
  mkdirSync(targetDir, { recursive: true });
  for (const result of suite.results ?? []) {
    const matches = expandResultPath(root, result.path);
    if (matches.length === 0) {
      out.push({
        path: result.path,
        format: result.format ?? "auto",
        bytes: 0,
        missing: true,
      });
      continue;
    }
    for (const match of matches) {
      const source = join(root, match);
      if (!existsSync(source)) {
        out.push({
          path: match,
          format: result.format ?? "auto",
          bytes: 0,
          missing: true,
        });
        continue;
      }
      const dest = join(targetDir, basename(match));
      copyFileSync(source, dest);
      out.push({
        path: dest.startsWith(root) ? dest.slice(root.length + 1) : dest,
        format: result.format ?? "auto",
        bytes: statSync(dest).size,
      });
    }
  }
  return out;
}

export function readPlan(root, planPath) {
  const text = readFileSync(resolve(root, planPath), "utf8");
  const plan = JSON.parse(text);
  if (!plan || !Array.isArray(plan.suites))
    throw new Error("plan.json must have a suites array");
  return plan;
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Runs the plan (or the named suites) and writes status.json after every
 * suite. Returns the final status.
 */
export async function runPlan({
  plan,
  runId,
  suites: only,
  root = process.cwd(),
  retries = 0,
  log = () => {},
}) {
  const runDir = join(root, ".neotest", "runs", runId);
  mkdirSync(join(runDir, "artifacts"), { recursive: true });
  const selected = plan.suites.filter(
    (s) => !s.notApplicable && (!only || only.includes(s.id)),
  );
  const status = {
    version: STATUS_VERSION,
    runId,
    startedAt: nowIso(),
    ...gitInfo(root),
    node: process.version,
    suites: selected.map((s) => ({
      id: s.id,
      status: "pending",
      artifacts: [],
    })),
  };
  const statusPath = join(runDir, "status.json");
  writeJson(statusPath, status);
  for (const suite of selected) {
    const entry = status.suites.find((s) => s.id === suite.id);
    entry.status = "running";
    entry.startedAt = nowIso();
    writeJson(statusPath, status);
    log(`▶ ${suite.name ?? suite.id}: ${suite.command}`);
    const cwd = resolve(root, suite.cwd ?? ".");
    const logPath = join(runDir, "artifacts", suite.id, "stdout.log");
    mkdirSync(dirname(logPath), { recursive: true });
    writeFileSync(logPath, "");
    const onOutput = (chunk) => {
      try {
        appendFileSync(logPath, chunk);
      } catch {
        // best effort
      }
    };
    let result;
    if (suite.setup) {
      const setup = await runCommand(suite.setup, {
        cwd,
        env: suite.env,
        timeoutSec: suite.timeoutSec,
        onOutput,
      });
      if (setup.exitCode !== 0) {
        result = {
          ...setup,
          error: `setup failed with exit code ${setup.exitCode}`,
        };
      }
    }
    if (!result) {
      let attempt = 0;
      do {
        result = await runCommand(suite.command, {
          cwd,
          env: suite.env,
          timeoutSec: suite.timeoutSec,
          onOutput,
        });
        attempt += 1;
        if (result.exitCode === 0 || result.timedOut) break;
        if (attempt <= retries)
          log(`↻ ${suite.id}: retry ${attempt}/${retries}`);
      } while (attempt <= retries);
      if (attempt > 1) entry.retries = attempt - 1;
    }
    if (suite.teardown) {
      await runCommand(suite.teardown, {
        cwd,
        env: suite.env,
        timeoutSec: 300,
        onOutput,
      });
    }
    entry.finishedAt = nowIso();
    entry.durationMs = result.durationMs;
    entry.exitCode = result.exitCode;
    entry.stdoutTail = tail(result.stdout ?? "");
    entry.stderrTail = tail(result.stderr ?? "");
    if (result.error) entry.error = result.error;
    entry.status = result.timedOut
      ? "timeout"
      : result.error
        ? "error"
        : result.exitCode === 0
          ? "passed"
          : "failed";
    entry.artifacts = collectArtifacts(root, runDir, suite);
    writeJson(statusPath, status);
    log(
      `${entry.status === "passed" ? "✓" : "✗"} ${suite.id}: ${entry.status} in ${Math.round(result.durationMs / 1000)}s`,
    );
  }
  status.finishedAt = nowIso();
  writeJson(statusPath, status);
  return status;
}

/* ── Mutation proof ────────────────────────────────────────────────────── */

/** Operator swaps, applied one at a time to distinct lines. */
export const MUTATORS = [
  { from: "===", to: "!==" },
  { from: "!==", to: "===" },
  { from: "<=", to: ">" },
  { from: ">=", to: "<" },
  { from: " < ", to: " >= " },
  { from: " > ", to: " <= " },
  { from: " && ", to: " || " },
  { from: " || ", to: " && " },
  { from: " + ", to: " - " },
  { from: " - ", to: " + " },
  { from: "return true", to: "return false" },
  { from: "return false", to: "return true" },
  { from: " == ", to: " != " },
  { from: " != ", to: " == " },
  { from: " not ", to: " " },
];

/**
 * Up to `max` mutants of `source`, on distinct lines, skipping comment lines
 * and lines that look like imports or string-only content. Deterministic.
 */
export function generateMutants(source, max = 6) {
  const lines = source.split("\n");
  const mutants = [];
  const used = new Set();
  for (let i = 0; i < lines.length && mutants.length < max; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("#") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("from ")
    )
      continue;
    for (const m of MUTATORS) {
      const at = line.indexOf(m.from);
      if (at === -1 || used.has(i)) continue;
      const mutated = [...lines];
      mutated[i] = line.slice(0, at) + m.to + line.slice(at + m.from.length);
      mutants.push({
        line: i + 1,
        from: m.from.trim(),
        to: m.to.trim(),
        source: mutated.join("\n"),
      });
      used.add(i);
      break;
    }
  }
  return mutants;
}

export async function mutateAndRun({
  plan,
  runId,
  file,
  suiteId,
  root = process.cwd(),
  maxMutants = 6,
  log = () => {},
}) {
  const suite = plan.suites.find((s) => s.id === suiteId);
  if (!suite) throw new Error(`unknown suite ${suiteId}`);
  const target = resolve(root, file);
  if (!existsSync(target)) throw new Error(`file not found: ${file}`);
  const original = readFileSync(target, "utf8");
  const mutants = generateMutants(original, maxMutants);
  const runDir = join(root, ".neotest", "runs", runId);
  const outPath = join(runDir, "mutation.json");
  const record = {
    version: STATUS_VERSION,
    runId,
    suiteId,
    file,
    startedAt: nowIso(),
    mutants: [],
  };
  writeJson(outPath, record);
  const cwd = resolve(root, suite.cwd ?? ".");
  const restore = () => writeFileSync(target, original);
  process.on("exit", restore);
  try {
    for (const m of mutants) {
      writeFileSync(target, m.source);
      log(`✂ ${file}:${m.line} ${m.from} → ${m.to}`);
      const result = await runCommand(suite.command, {
        cwd,
        env: suite.env,
        timeoutSec: suite.timeoutSec,
      });
      restore();
      const killed = result.exitCode !== 0 && !result.timedOut;
      record.mutants.push({
        file,
        line: m.line,
        from: m.from,
        to: m.to,
        killed,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        error: result.error ?? (result.timedOut ? "timeout" : undefined),
      });
      writeJson(outPath, record);
      log(`${killed ? "☠" : "⚠ survived"} ${file}:${m.line}`);
    }
  } finally {
    restore();
    process.off("exit", restore);
  }
  record.finishedAt = nowIso();
  writeJson(outPath, record);
  return record;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const plan = readPlan(args.root, args.plan);
  const log = (line) => console.log(line);
  if (args.mutate) {
    if (!args.suite) throw new Error("--mutate needs --suite <id>");
    const record = await mutateAndRun({
      plan,
      runId: args.run,
      file: args.mutate,
      suiteId: args.suite,
      root: args.root,
      maxMutants: args.maxMutants,
      log,
    });
    const killed = record.mutants.filter((m) => m.killed).length;
    console.log(
      `\n${killed}/${record.mutants.length} mutants killed. Record: .neotest/runs/${args.run}/mutation.json`,
    );
    process.exit(0);
  }
  const status = await runPlan({
    plan,
    runId: args.run,
    suites: args.suites,
    root: args.root,
    retries: args.retries,
    log,
  });
  const failed = status.suites.filter((s) => s.status !== "passed").length;
  console.log(
    `\n${status.suites.length - failed}/${status.suites.length} suites passed. Status: .neotest/runs/${args.run}/status.json`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("run.mjs")
) {
  main().catch((error) => {
    console.error(error?.message ?? error);
    process.exit(2);
  });
}
