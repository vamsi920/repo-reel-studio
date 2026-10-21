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
export const REPLAY_SCENARIOS_DIR = "parity/scenarios";
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
  generatedAt: string;
  legacy: string;
  target: string;
  scenarios: number;
  total: number;
  identical: number;
  legacyDataCases: number;
  legacyDataIdentical: number;
  /** Both apps were reset to the same fresh data before every scenario. */
  freshData?: boolean;
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
): Promise<ReplayReport | null> {
  try {
    const result = await run(
      `test -f ${REPLAY_REPORT_PATH} && cat ${REPLAY_REPORT_PATH} || true`,
    );
    const text = result.stdout?.trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as ReplayReport;
    return typeof parsed?.total === "number" ? parsed : null;
  } catch {
    return null;
  }
}

export type ReplayVerdict =
  | {
      ok: true;
      total: number;
      identical: number;
      legacyDataCases: number;
    }
  | { ok: false; reason: string; differences?: ReplayReport["differences"] };

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
  return {
    ok: true,
    total: report.total,
    identical: report.identical,
    legacyDataCases: report.legacyDataCases,
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
