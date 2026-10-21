import REPLAY_HARNESS_SOURCE from "./neome-replay.mjs?raw";
import { buildWriteFileCommands } from "#/lib/knowledge/kt-workspace-export";
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

/**
 * Neo ME's own differential replay harness (./neome-replay.mjs), installed
 * into the project workspace so the parity bar does not depend on how
 * thorough the agent's hand-written tests are. Live run 3 (flaskr to
 * Express) reported 11/11 parity from such tests while a replay found 12 of
 * 14 user-visible steps different and every legacy user locked out.
 *
 * The agent writes scenarios; the harness compares everything a user or
 * client observes and writes a report that the studio reads itself before it
 * lets a verify step finish.
 */
export const REPLAY_HARNESS_PATH = ".neome/replay.mjs";
export const REPLAY_REPORT_PATH = ".neome/replay-report.json";
export const CHARACTERIZE_REPORT_PATH = ".neome/characterize-report.json";
export const REPLAY_APPS_PATH = "parity/apps.json";
export const REA_REPORT_PATH = ".neome/rea-report.json";
export const REA_CHARACTERIZE_REPORT_PATH =
  ".neome/rea-characterize-report.json";
export const REA_SCENARIOS_DIR = "parity/browser";
export const SYNTH_DIR = "parity/synth";
export const SYNTH_SQL_PATH = `${SYNTH_DIR}/fixture.sql`;
/** Characterization happens before building, so it may be a while old. */
export const CHARACTERIZE_REPORT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Handed to the agent in the describe receipt so it never guesses formats. */
export const REPLAY_APPS_EXAMPLE = {
  fixture: "parity/fixture.sqlite",
  synth: { sql: "parity/synth/fixture.sql" },
  rea: {
    executable_path:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  },
  legacy: {
    cwd: ".",
    start: ".venv/bin/flask --app app run --port 5911",
    url: "http://127.0.0.1:5911",
    store: "instance/app.sqlite",
  },
  target: {
    cwd: "new-app",
    start: "node server.js",
    url: "http://127.0.0.1:5912",
    store: "data/app.sqlite",
    env: { DATABASE_PATH: "data/app.sqlite" },
  },
};
export const REPLAY_SCENARIO_EXAMPLE = {
  name: "sign up, post, edit",
  legacyData: false,
  steps: [
    {
      name: "register",
      session: "alice",
      method: "POST",
      path: "/auth/register",
      form: { username: "alice", password: "pw" },
    },
    { name: "home after register", session: "alice", path: "/" },
    {
      name: "create via API",
      session: "alice",
      method: "POST",
      path: "/api/items",
      json: { title: "t" },
      capture: { id: { json: "item.id" } },
    },
    { name: "read it back", session: "alice", path: "/api/items/{{id}}" },
  ],
};
export const REPLAY_SCENARIOS_DIR = "parity/scenarios";
/** A REA capture_browser_scenario input without "browser", origin as {{BASE}}. */
export const REA_BROWSER_SCENARIO_EXAMPLE = {
  name: "sign in and see the home page",
  start_url: { url: "{{BASE}}/auth/login" },
  actions: [
    {
      step_id: "user",
      action: "fill",
      locator: { kind: "css", selector: "input[name=username]" },
      value: { source: "literal", value: "alice" },
    },
    {
      step_id: "pass",
      action: "fill",
      locator: { kind: "css", selector: "input[name=password]" },
      value: { source: "literal", value: "pw" },
    },
    {
      step_id: "submit",
      action: "click",
      locator: { kind: "css", selector: "input[type=submit]" },
    },
    { step_id: "settle", action: "wait_for_timeout", duration_ms: 400 },
    {
      step_id: "home",
      action: "goto",
      destination: { url: "{{BASE}}/" },
      wait_until: "load",
    },
  ],
};
/** A report older than this does not describe the code being verified. */
export const REPLAY_REPORT_MAX_AGE_MS = 60 * 60 * 1000;

export interface WorkspaceCommandResult {
  exit_code: number;
  stdout?: string;
  stderr?: string;
}

/** Runs one shell command in the project's workspace (its working dir). */
export type RunInWorkspace = (
  command: string,
) => Promise<WorkspaceCommandResult>;

export interface ReplayReport {
  version: number;
  /** "replay" (legacy vs new) or "characterize" (legacy vs itself). */
  kind?: "replay" | "characterize";
  generatedAt: string;
  legacy: string;
  target: string;
  scenarios: number;
  total: number;
  identical: number;
  legacyDataCases: number;
  legacyDataIdentical: number;
  /** Status codes the legacy app answered with across all steps. */
  legacyStatuses?: Record<string, number>;
  /** Both apps were reset to the same fresh data before every scenario. */
  freshData?: boolean;
  /** Neo Synth rows were loaded into both stores on top of the fixture. */
  synthApplied?: boolean;
  synthDataCases?: number;
  synthDataIdentical?: number;
  /** What each app wrote, table by table (SQLite stores only). */
  store?: {
    applicable: boolean;
    compared: number;
    identical: number;
    skipped: { table: string; reason: string }[];
    differences: unknown[];
  };
  differences: {
    scenario: string;
    step: string;
    field: string;
    legacy: unknown;
    target: unknown;
  }[];
}

/** Writes the harness into the workspace. Never throws. */
export async function installReplayHarness(
  run: RunInWorkspace,
): Promise<boolean> {
  try {
    const commands = [
      "mkdir -p .neome",
      ...buildWriteFileCommands({
        path: REPLAY_HARNESS_PATH,
        content: REPLAY_HARNESS_SOURCE,
      }),
    ];
    for (const command of commands) {
      // Sequential: chunked writes to one file must stay ordered.
      const result = await run(command);
      if (result.exit_code !== 0) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Reads the last report, or null when there is none (or it is unreadable). */
export async function readReplayReport(
  run: RunInWorkspace,
  path: string = REPLAY_REPORT_PATH,
): Promise<ReplayReport | null> {
  try {
    const result = await run(`test -f ${path} && cat ${path} || true`);
    const text = result.stdout?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as ReplayReport;
    return typeof parsed?.total === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Error paths are where migrations drift (flaskr run 1: 403/404/405 pages);
 * a suite in which the legacy app never answered 4xx did not exercise them.
 */
function coversErrorPaths(report: ReplayReport): boolean {
  return Object.keys(report.legacyStatuses ?? {}).some((code) => {
    const n = Number(code);
    return n >= 400 && n < 500;
  });
}

export interface ReaReport {
  version: number;
  kind: "rea" | "rea-characterize";
  generatedAt: string;
  tool: string;
  legacy: string;
  target: string | null;
  scenarios: number;
  unchanged: number;
  freshData: boolean;
  synthApplied?: boolean;
  harnessNormalization: string[];
  results: {
    scenario: string;
    status: string;
    error?: string;
    evidence: { legacy?: string; target?: string; compare?: string };
    changed: {
      step: string | null;
      artifact: string;
      status: string;
      reason?: string | null;
    }[];
  }[];
}

/** Reads the last REA lane report, or null. */
export async function readReaReport(
  run: RunInWorkspace,
  path: string = REA_REPORT_PATH,
): Promise<ReaReport | null> {
  try {
    const result = await run(`test -f ${path} && cat ${path} || true`);
    const text = result.stdout?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as ReaReport;
    return typeof parsed?.scenarios === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/** The project's parity/apps.json, or null when missing or invalid. */
export async function readReplayApps(
  run: RunInWorkspace,
): Promise<Record<string, unknown> | null> {
  try {
    const result = await run(
      `test -f ${REPLAY_APPS_PATH} && cat ${REPLAY_APPS_PATH} || true`,
    );
    const text = result.stdout?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Why the REA lane does not apply to this project, if the agent said so. */
export function reaNotApplicable(
  apps: Record<string, unknown> | null,
): string | null {
  const rea = apps?.rea as { not_applicable?: unknown } | undefined;
  return typeof rea?.not_applicable === "string" && rea.not_applicable.trim()
    ? rea.not_applicable.trim()
    : null;
}

export type ReaVerdict =
  | { ok: true; scenarios: number; unchanged: number; skipped?: string }
  | {
      ok: false;
      reason: string;
      changed?: ReaReport["results"][number]["changed"];
    };

/**
 * Whether REA agrees: every browser scenario captured against both apps on
 * the fresh fixture, within the hour, and REA's own comparison says
 * "unchanged" for each. `notApplicable` (from apps.json) skips the lane with
 * the stated reason recorded.
 */
export function judgeReaReport(
  report: ReaReport | null,
  {
    now,
    kind,
    notApplicable,
    maxAgeMs,
  }: {
    now: number;
    kind: "rea" | "rea-characterize";
    notApplicable: string | null;
    maxAgeMs: number;
  },
): ReaVerdict {
  if (notApplicable) {
    return { ok: true, scenarios: 0, unchanged: 0, skipped: notApplicable };
  }
  if (report?.kind !== kind) return { ok: false, reason: "rea_report_missing" };
  const age = now - Date.parse(report.generatedAt);
  if (!Number.isFinite(age) || age > maxAgeMs) {
    return { ok: false, reason: "rea_report_stale" };
  }
  if (report.scenarios <= 0) return { ok: false, reason: "rea_no_scenarios" };
  if (report.freshData !== true) {
    return { ok: false, reason: "rea_not_fresh_data" };
  }
  if (report.unchanged < report.scenarios) {
    const changed = report.results
      .filter((r) => r.status !== "unchanged")
      .flatMap((r) =>
        r.error
          ? [
              {
                step: null,
                artifact: "capture",
                status: "error",
                reason: r.error,
              },
            ]
          : r.changed,
      )
      .slice(0, 12);
    return {
      ok: false,
      reason: `rea_changed:${report.scenarios - report.unchanged}`,
      changed,
    };
  }
  return { ok: true, scenarios: report.scenarios, unchanged: report.unchanged };
}

export type ReplayVerdict =
  | {
      ok: true;
      total: number;
      identical: number;
      legacyDataCases: number;
      synthDataCases: number;
      storeTables: number;
    }
  | { ok: false; reason: string; differences?: ReplayReport["differences"] };

/**
 * Data flows, not only pages: the Synth rows must be in both stores and
 * read through the app (synthData scenarios), and what the apps wrote must
 * match table by table when both stores are SQLite.
 */
function judgeDataFlows(
  report: ReplayReport,
  noPersistentData: boolean,
): { ok: true } | { ok: false; reason: string; differences?: unknown[] } {
  if (noPersistentData) return { ok: true };
  if (report.synthApplied !== true) {
    return { ok: false, reason: "synth_data_not_loaded" };
  }
  if ((report.synthDataCases ?? 0) <= 0) {
    return { ok: false, reason: "replay_no_synth_data_steps" };
  }
  const store = report.store;
  if (store?.applicable) {
    if (store.compared <= 0) {
      return { ok: false, reason: "store_no_comparable_tables" };
    }
    if (store.identical < store.compared) {
      return {
        ok: false,
        reason: `store_differences:${store.compared - store.identical}`,
        differences: store.differences.slice(0, 12),
      };
    }
  }
  return { ok: true };
}

/**
 * Whether a report proves parity: recent, two different apps, at least one
 * step, both apps reset to the same data before every scenario, every step
 * identical, and legacy-data steps unless the project declared it keeps no
 * persistent data.
 */
export function judgeReplayReport(
  report: ReplayReport | null,
  { now, noPersistentData }: { now: number; noPersistentData: boolean },
): ReplayVerdict {
  if (!report) return { ok: false, reason: "replay_report_missing" };
  if (report.kind === "characterize") {
    return { ok: false, reason: "replay_report_is_characterization" };
  }
  const age = now - Date.parse(report.generatedAt);
  if (!Number.isFinite(age) || age > REPLAY_REPORT_MAX_AGE_MS) {
    return { ok: false, reason: "replay_report_stale" };
  }
  if (!report.legacy || !report.target || report.legacy === report.target) {
    return { ok: false, reason: "replay_not_two_apps" };
  }
  if (report.total <= 0) return { ok: false, reason: "replay_no_steps" };
  if (report.freshData !== true) {
    return { ok: false, reason: "replay_not_fresh_data" };
  }
  if (!coversErrorPaths(report)) {
    return { ok: false, reason: "replay_no_error_paths" };
  }
  if (report.identical < report.total) {
    return {
      ok: false,
      reason: `replay_differences:${report.total - report.identical}`,
      differences: report.differences.slice(0, 12),
    };
  }
  if (!noPersistentData && report.legacyDataCases <= 0) {
    return { ok: false, reason: "replay_no_legacy_data" };
  }
  const flows = judgeDataFlows(report, noPersistentData);
  if (!flows.ok) {
    return {
      ok: false,
      reason: flows.reason,
      differences: flows.differences as ReplayReport["differences"],
    };
  }
  return {
    ok: true,
    total: report.total,
    identical: report.identical,
    legacyDataCases: report.legacyDataCases,
    synthDataCases: report.synthDataCases ?? 0,
    storeTables: report.store?.applicable ? report.store.compared : 0,
  };
}

/**
 * A runner bound to one conversation's runtime and working directory (the
 * project folder, or the clone for a repository project). The working dir is
 * resolved once, on first use.
 */
export function createWorkspaceRunner(
  conversationId: string,
  conversationUrl: string | null | undefined,
  sessionApiKey: string | null | undefined,
): RunInWorkspace {
  let cwd: Promise<string> | null = null;
  return async (command) => {
    cwd ??=
      AgentServerConversationService.resolveConversationWorkingDir(
        conversationId,
      );
    return AgentServerRuntimeService.executeCommand(
      conversationUrl,
      sessionApiKey,
      command,
      await cwd,
      60,
    );
  };
}

/**
 * Whether characterization ran: every scenario replayed twice against the
 * legacy app alone, on the fresh fixture, with identical results.
 */
export function judgeCharacterizeReport(
  report: ReplayReport | null,
  {
    now,
    noPersistentData = false,
  }: { now: number; noPersistentData?: boolean },
): ReplayVerdict {
  if (report?.kind !== "characterize") {
    return { ok: false, reason: "characterization_not_run" };
  }
  const age = now - Date.parse(report.generatedAt);
  if (!Number.isFinite(age) || age > CHARACTERIZE_REPORT_MAX_AGE_MS) {
    return { ok: false, reason: "characterization_stale" };
  }
  if (report.total <= 0)
    return { ok: false, reason: "characterization_no_steps" };
  if (report.freshData !== true) {
    return { ok: false, reason: "characterization_not_fresh_data" };
  }
  if (!coversErrorPaths(report)) {
    return { ok: false, reason: "characterization_no_error_paths" };
  }
  if (report.identical < report.total) {
    return {
      ok: false,
      reason: `characterization_nondeterministic:${report.total - report.identical}`,
      differences: report.differences.slice(0, 12),
    };
  }
  if (!noPersistentData && report.synthApplied !== true) {
    return { ok: false, reason: "characterization_without_synth_data" };
  }
  return {
    ok: true,
    total: report.total,
    identical: report.identical,
    legacyDataCases: report.legacyDataCases,
    synthDataCases: report.synthDataCases ?? 0,
    storeTables: 0,
  };
}
