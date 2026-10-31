/**
 * Browser side of the Neo Test harness: install it into the workspace,
 * write the plan, start a run detached (test suites outlive the runtime's
 * per-command timeout), poll its status file, read the artifacts it copied,
 * and keep the project's report files current.
 *
 * All content travels base64-encoded through `buildWriteFileCommands`; no
 * file content is ever interpolated raw into a shell command.
 *
 * @spec NT-003 — Harness
 * @spec NT-006 — Report, always present
 */
import HARNESS_SOURCE from "./neotest-runner.mjs?raw";
import { buildWriteFileCommands } from "#/lib/knowledge/kt-workspace-export";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { readWorkspaceFile } from "#/lib/synth/workspace";
import type {
  HarnessMutation,
  HarnessStatus,
  SuitePlan,
  TestReport,
} from "./model";

export const NEOTEST_DIR = ".neotest";
export const HARNESS_PATH = `${NEOTEST_DIR}/run.mjs`;
export const PLAN_PATH = `${NEOTEST_DIR}/plan.json`;
export const RUNS_DIR = `${NEOTEST_DIR}/runs`;
export const RESULTS_DIR = `${NEOTEST_DIR}/results`;
export const REPORT_MD_PATH = `${NEOTEST_DIR}/REPORT.md`;
export const LATEST_JSON_PATH = `${NEOTEST_DIR}/latest.json`;
export const GIT_EXCLUDE_ENTRY = `${NEOTEST_DIR}/`;

/** Paths we read back: no quotes, no parent references. */
const SAFE_ID = /^[\w.-]+$/;
export const POLL_INTERVAL_MS = 3000;
/** A whole run may take a while; per-suite timeouts live in the plan. */
export const DEFAULT_RUN_TIMEOUT_MS = 45 * 60 * 1000;
/** Artifacts bigger than this are read in part (the parsers cope). */
export const MAX_ARTIFACT_BYTES = 6 * 1024 * 1024;

export function runDir(runId: string): string {
  return `${RUNS_DIR}/${runId}`;
}
export function statusPath(runId: string): string {
  return `${runDir(runId)}/status.json`;
}
export function mutationPath(runId: string): string {
  return `${runDir(runId)}/mutation.json`;
}
export function reportPath(runId: string): string {
  return `${runDir(runId)}/report.json`;
}
export function harnessLogPath(runId: string): string {
  return `${runDir(runId)}/harness.log`;
}

function excludeCommand(): string {
  return `if [ -d .git/info ]; then grep -qxF '${GIT_EXCLUDE_ENTRY}' .git/info/exclude 2>/dev/null || echo '${GIT_EXCLUDE_ENTRY}' >> .git/info/exclude; fi`;
}

/** Writes one text file (chunked base64); false when any chunk failed. */
async function writeText(
  run: RunInWorkspace,
  path: string,
  content: string,
): Promise<boolean> {
  const dir = path.split("/").slice(0, -1).join("/");
  const commands = [
    ...(dir ? [`mkdir -p '${dir}'`] : []),
    ...buildWriteFileCommands({ path: `'${path}'`, content }),
  ];
  for (const command of commands) {
    const result = await run(command);
    if (result.exit_code !== 0) return false;
  }
  return true;
}

/** Installs (or refreshes) the harness; idempotent. */
export async function installHarness(run: RunInWorkspace): Promise<boolean> {
  try {
    const prepared = await run(
      `mkdir -p '${RUNS_DIR}' '${RESULTS_DIR}' && ${excludeCommand()}`,
    );
    if (prepared.exit_code !== 0) return false;
    return await writeText(run, HARNESS_PATH, HARNESS_SOURCE);
  } catch {
    return false;
  }
}

/** Serialises the plan for the harness (only what it needs). */
export function planFile(suites: SuitePlan[]): string {
  return `${JSON.stringify(
    {
      version: 1,
      suites: suites
        .filter((s) => !s.notApplicable)
        .map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          command: s.command,
          cwd: s.cwd,
          env: s.env,
          timeoutSec: s.timeoutSec,
          setup: s.setup,
          teardown: s.teardown,
          results: s.results,
        })),
    },
    null,
    2,
  )}\n`;
}

export async function writePlan(
  run: RunInWorkspace,
  suites: SuitePlan[],
): Promise<boolean> {
  try {
    return await writeText(run, PLAN_PATH, planFile(suites));
  } catch {
    return false;
  }
}

/** The command the harness is started with; exported for the brief/tests. */
export function harnessCommand(runId: string, suiteIds?: string[]): string {
  const suites = suiteIds?.length ? ` --suites ${suiteIds.join(",")}` : "";
  return `node ${HARNESS_PATH} --plan ${PLAN_PATH} --run ${runId}${suites}`;
}

export function mutationCommand(
  runId: string,
  file: string,
  suiteId: string,
  maxMutants = 6,
): string {
  return `node ${HARNESS_PATH} --plan ${PLAN_PATH} --run ${runId} --mutate '${file}' --suite ${suiteId} --max-mutants ${maxMutants}`;
}

/**
 * Starts a run detached from the runtime command (which has its own short
 * timeout) and returns at once. Progress is read from status.json.
 */
export async function startRun(
  run: RunInWorkspace,
  runId: string,
  suiteIds?: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (!SAFE_ID.test(runId)) return { ok: false, error: "bad run id" };
  const log = harnessLogPath(runId);
  const result = await run(
    `mkdir -p '${runDir(runId)}' && (nohup ${harnessCommand(runId, suiteIds)} > '${log}' 2>&1 < /dev/null &) ; echo started`,
  );
  if (result.exit_code !== 0) {
    return { ok: false, error: result.stderr || "could not start the harness" };
  }
  return { ok: true };
}

export async function startMutation(
  run: RunInWorkspace,
  runId: string,
  file: string,
  suiteId: string,
  maxMutants?: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!SAFE_ID.test(runId) || !SAFE_ID.test(suiteId))
    return { ok: false, error: "bad id" };
  if (!/^[\w./@ +,-]+$/.test(file) || file.includes(".."))
    return { ok: false, error: "bad file path" };
  const log = `${runDir(runId)}/mutation.log`;
  const result = await run(
    `mkdir -p '${runDir(runId)}' && (nohup ${mutationCommand(runId, file, suiteId, maxMutants)} > '${log}' 2>&1 < /dev/null &) ; echo started`,
  );
  if (result.exit_code !== 0) {
    return {
      ok: false,
      error: result.stderr || "could not start the mutation run",
    };
  }
  return { ok: true };
}

async function readJson<T>(
  run: RunInWorkspace,
  path: string,
): Promise<T | null> {
  const text = await readWorkspaceFile(run, path, MAX_ARTIFACT_BYTES);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function readStatus(run: RunInWorkspace, runId: string) {
  return readJson<HarnessStatus>(run, statusPath(runId));
}

export function readMutation(run: RunInWorkspace, runId: string) {
  return readJson<HarnessMutation>(run, mutationPath(runId));
}

export function readLatestReport(run: RunInWorkspace) {
  return readJson<TestReport>(run, LATEST_JSON_PATH);
}

/** Polls a status file until the harness marks it finished or time runs out. */
export async function waitForStatus(
  run: RunInWorkspace,
  runId: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    onProgress?: (status: HarnessStatus) => void;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<{ status: HarnessStatus | null; timedOut: boolean }> {
  const sleep =
    options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  let last: HarnessStatus | null = null;
  let lastSignature = "";
  while (now() < deadline) {
    const status = await readStatus(run, runId);
    if (status) {
      last = status;
      const signature = status.suites
        .map((s) => `${s.id}:${s.status}`)
        .join(",");
      if (signature !== lastSignature) {
        lastSignature = signature;
        options.onProgress?.(status);
      }
      if (status.finishedAt) return { status, timedOut: false };
    }
    await sleep(options.intervalMs ?? POLL_INTERVAL_MS);
  }
  return { status: last, timedOut: true };
}

export async function waitForMutation(
  run: RunInWorkspace,
  runId: string,
  options: {
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<{ record: HarnessMutation | null; timedOut: boolean }> {
  const sleep =
    options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const deadline = now() + (options.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS);
  let last: HarnessMutation | null = null;
  while (now() < deadline) {
    const record = await readMutation(run, runId);
    if (record) {
      last = record;
      if (record.finishedAt) return { record, timedOut: false };
    }
    await sleep(options.intervalMs ?? POLL_INTERVAL_MS);
  }
  return { record: last, timedOut: true };
}

/** Reads an artifact the harness copied; null when missing. */
export function readArtifact(run: RunInWorkspace, path: string) {
  return readWorkspaceFile(run, path, MAX_ARTIFACT_BYTES);
}

/** Writes report.json for the run plus the always-current REPORT.md/latest.json. */
export async function writeReportFiles(
  run: RunInWorkspace,
  report: TestReport,
  markdown: string,
): Promise<string[]> {
  const written: string[] = [];
  const json = `${JSON.stringify(report, null, 2)}\n`;
  for (const [path, content] of [
    [reportPath(report.runId), json],
    [LATEST_JSON_PATH, json],
    [REPORT_MD_PATH, markdown],
  ] as const) {
    if (await writeText(run, path, content).catch(() => false))
      written.push(path);
  }
  return written;
}

/** Whether KT docs exist in the workspace (the agent reads them first). */
export async function hasKtDocs(run: RunInWorkspace): Promise<boolean> {
  try {
    const result = await run(
      "test -f .neodevex/kt/INDEX.md && echo yes || true",
    );
    return (result.stdout ?? "").includes("yes");
  } catch {
    return false;
  }
}

/** Synth datasets present in the workspace (synthetic-data/<run>/manifest.json). */
export async function listSynthRunsInWorkspace(
  run: RunInWorkspace,
): Promise<string[]> {
  try {
    const result = await run("ls -1d synthetic-data/*/ 2>/dev/null | head -20");
    return (result.stdout ?? "")
      .split("\n")
      .map((l) => l.trim().replace(/\/$/, ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}
