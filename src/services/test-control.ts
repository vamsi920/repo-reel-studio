import type {
  OpenHandsEvent,
  TestControlAction,
} from "#/types/agent-server/core";
import {
  isMessageEvent,
  isTestControlActionEvent,
} from "#/types/agent-server/type-guards";
import {
  TEST_CONTROL_COMMANDS,
  TEST_RESULT_PREFIX,
  type TestControlCommand,
} from "#/constants/test-control";
import {
  latestReport,
  newTestId,
  useTestStudioStore,
  type ChoiceOption,
  type ChoiceQuestion,
  type Finding,
  type StackInfo,
  type TestProject,
  type TestRun,
} from "#/stores/test-studio-store";
import {
  ARTIFACT_FORMATS,
  GATE_METRICS,
  KIND_LABELS,
  TEST_KINDS,
  isArtifactFormat,
  isTestKind,
  passRate,
  slugId,
  type GateRule,
  type ParsedArtifact,
  type Severity,
  type SuitePlan,
  type TestKind,
  type TestReport,
} from "#/lib/testing/model";
import {
  DEFAULT_GATES,
  METRIC_LABELS,
  evaluateGates,
  normalizeGates,
} from "#/lib/testing/gates";
import {
  buildReport,
  reportHeadline,
  reportMarkdown,
} from "#/lib/testing/report";
import { toCtrf } from "#/lib/testing/ctrf";
import { parseArtifact, parseNeotestMutation } from "#/lib/testing/parsers";
import { STACK_FIND_COMMAND, detectStack } from "#/lib/testing/stack";
import { catalogByKind } from "#/lib/testing/catalog";
import {
  DEFAULT_RUN_TIMEOUT_MS,
  HARNESS_PATH,
  LATEST_JSON_PATH,
  NEOTEST_DIR,
  PLAN_PATH,
  REPORT_MD_PATH,
  RESULTS_DIR,
  hasKtDocs,
  harnessCommand,
  installHarness,
  listSynthRunsInWorkspace,
  mutationCommand,
  readArtifact,
  startMutation,
  startRun,
  waitForMutation,
  waitForStatus,
  writePlan,
  writeReportFiles,
} from "#/lib/testing/harness";
import { readWorkspaceFile } from "#/lib/synth/workspace";
import { useSynthStudioStore } from "#/stores/synth-studio-store";
import {
  ensureKtInWorkspace,
  generateKtForProject,
  knowledgeRepositoryId,
  resolveTestKnowledge,
  summarizeKnowledge,
  type TestRuntime,
} from "#/lib/testing/kt";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";

/**
 * Dispatcher for the `test_control` client tool (Neo Test).
 *
 * Mirrors `synth-control.ts`: every command mutates the studio store (which
 * the workbench renders) and posts a receipt back into the conversation,
 * because the agent-server acknowledges client tools before the browser
 * does any work. A rejecting receipt always says what would have been valid.
 *
 * The important rule: the agent never reports test numbers. `run` and
 * `prove` are executed HERE through the harness, the artifacts are parsed
 * here, and the receipt carries what was measured.
 *
 * @spec NT-007 — Enforcement
 */

export type PostResultFn = (message: string) => void;

export interface DispatchContext {
  postResult: PostResultFn;
  conversationId?: string;
  /** Runs a shell command in the project's workspace, when attached to a runtime. */
  runInWorkspace?: RunInWorkspace;
  /** The conversation's runtime, for KT export/generation through the SDK. */
  runtime?: {
    conversationUrl: string | null;
    sessionApiKey: string | null;
    workingDir: string | null;
    backendId?: string | null;
  };
  /** Id of the ActionEvent being dispatched; dedupes replays. */
  actionId?: string;
  /** Clock override for tests. */
  now?: () => number;
  /** Polling overrides for tests. */
  poll?: {
    intervalMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
  };
}

export const RECEIPT_NEXT_STEP =
  "Act on this now: call the next test_control command, or write to the user. Do not reply empty.";

export function withNextStep(message: string): string {
  if (!message.startsWith(TEST_RESULT_PREFIX)) return message;
  try {
    const payload = JSON.parse(message.slice(TEST_RESULT_PREFIX.length));
    if (!payload || typeof payload !== "object" || "next" in payload)
      return message;
    return `${TEST_RESULT_PREFIX}${JSON.stringify({ ...payload, next: RECEIPT_NEXT_STEP })}`;
  } catch {
    return message;
  }
}

export function createTestResultPoster(conversationId: string): PostResultFn {
  return (message: string) => {
    void AgentServerConversationService.sendMessage(conversationId, {
      role: "user",
      content: [{ type: "text", text: withNextStep(message) }],
    }).catch(() => {
      // The workbench already shows the outcome; a lost receipt must not
      // break the dispatch.
    });
  };
}

export function receipt(payload: Record<string, unknown>): string {
  return `${TEST_RESULT_PREFIX}${JSON.stringify(payload)}`;
}

function postReceipt(
  context: DispatchContext,
  payload: Record<string, unknown>,
) {
  context.postResult(receipt(payload));
}

function isCommand(value: string): value is TestControlCommand {
  return (TEST_CONTROL_COMMANDS as readonly string[]).includes(value);
}

function payloadOf(action: TestControlAction): Record<string, unknown> {
  const payload = action.payload;
  return payload && typeof payload === "object" ? payload : {};
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const strList = (v: unknown): string[] =>
  Array.isArray(v)
    ? v
        .filter(
          (x): x is string => typeof x === "string" && x.trim().length > 0,
        )
        .map((x) => x.trim())
    : [];
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;

/** The project a conversation belongs to (the studio sets conversationId at start). */
export function findProjectForConversation(
  conversationId: string | undefined,
): TestProject | null {
  if (!conversationId) return null;
  const { projects, activeProjectId } = useTestStudioStore.getState();
  const byConversation = Object.values(projects).find(
    (p) => p.conversationId === conversationId,
  );
  if (byConversation) return byConversation;
  return activeProjectId ? (projects[activeProjectId] ?? null) : null;
}

/** Payload shapes, handed to the agent by `describe`. */
export const COMMAND_SHAPES = Object.freeze({
  describe:
    "{} | {generate_kt: true} (starts KT doc generation from this checkout when none exist; a kt_docs_ready receipt follows)",
  record_stack:
    "{languages:[string], frameworks?:[string], runners?:[string], existing_suites?:[{kind, name, command?, path?}], app_start?:{command, url, ready_path?}, data_sources?:[string], ci?:[string], notes?, evidence:[paths]}",
  set_plan: `{suites:[{id?, kind: ${TEST_KINDS.join("|")}, name, command, cwd?, env?:{NAME: value}, timeout_sec?, setup?, teardown?, results:[{path, format?: ${ARTIFACT_FORMATS.join("|")}}], targets?:[paths], rationale?, origin?: existing|agent, not_applicable?: string (reason the kind cannot be tested here), evidence?:[paths]}], replace?: boolean} -- result paths are workspace-relative; write results under ${RESULTS_DIR}/ (e.g. --reporter=junit --outputFile=${RESULTS_DIR}/unit-junit.xml, coverage lcov under ${RESULTS_DIR}/coverage/). Data suites write ${RESULTS_DIR}/checks.json: {checks:[{name, dataset?, column?, status: pass|warn|fail|error, severity?: critical|high|medium|low, metric?, expected?, unexpected_count?, unexpected_percent?, message?}]}`,
  set_gates: `{gates:[{id?, metric: ${GATE_METRICS.join("|")}, op?: <=|>=|==, threshold: number, blocking?: boolean (default true), scope?: perf scenario name}], reset_defaults?: boolean}`,
  ask_choice:
    "{question_id, title, prompt?, kind: single|multi, options:[{id, label, description?, recommended?}], allow_other?: boolean} -> wait for {status:'answered', question_id, selected, other?}",
  run: `{suite_ids?: [string] (default: every applicable suite), retries?: 0|1|2} -> the studio installs ${HARNESS_PATH}, writes ${PLAN_PATH}, runs the suites, parses every result file, evaluates the gates and writes ${REPORT_MD_PATH}; the receipt carries the measured numbers. Runs can take many minutes; wait for the receipt.`,
  prove:
    "{file: path, suite_id, max_mutants?: 1..12} -> the studio applies operator mutants to the file one at a time, runs the suite after each, restores the file, and reports killed/survived. Use it on files your new tests cover.",
  record_finding:
    "{findings:[{id?, title, severity: critical|high|medium|low|info, kind, description, file?, line?, suite?, test?, evidence:[paths or test names], status?: open|fixed|wontfix}]}",
  log: "{text, level?: info|warn|error|success}",
  complete: "{summary, artifacts?:[paths]}",
});

/* ── Payload parsing ───────────────────────────────────────────────────── */

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
function severityOf(v: unknown): Severity | undefined {
  return typeof v === "string" && (SEVERITIES as string[]).includes(v)
    ? (v as Severity)
    : undefined;
}

function parseStack(
  raw: Record<string, unknown>,
  at: string,
): StackInfo | null {
  const languages = strList(raw.languages);
  if (languages.length === 0) return null;
  const existing = Array.isArray(raw.existing_suites)
    ? raw.existing_suites
        .map(obj)
        .filter(
          (s): s is Record<string, unknown> =>
            !!s && isTestKind(s.kind) && !!str(s.name),
        )
        .map((s) => ({
          kind: s.kind as TestKind,
          name: str(s.name)!,
          command: str(s.command),
          path: str(s.path),
        }))
    : [];
  const appStart = obj(raw.app_start);
  return {
    languages,
    frameworks: strList(raw.frameworks),
    runners: strList(raw.runners),
    existingSuites: existing,
    appStart:
      appStart && str(appStart.command) && str(appStart.url)
        ? {
            command: str(appStart.command)!,
            url: str(appStart.url)!,
            readyPath: str(appStart.ready_path),
          }
        : undefined,
    dataSources: strList(raw.data_sources),
    ci: strList(raw.ci),
    notes: str(raw.notes)?.slice(0, 1000),
    evidence: strList(raw.evidence),
    recordedAt: at,
  };
}

const SAFE_PATH = /^[\w./@ ()+*,-]+$/;

function parseSuites(raw: unknown): {
  suites: SuitePlan[];
  rejected: string[];
} {
  const suites: SuitePlan[] = [];
  const rejected: string[] = [];
  if (!Array.isArray(raw))
    return { suites, rejected: ["suites must be an array"] };
  raw.forEach((item, i) => {
    const s = obj(item);
    if (!s) {
      rejected.push(`#${i}: not an object`);
      return;
    }
    if (!isTestKind(s.kind)) {
      rejected.push(`#${i}: kind must be one of ${TEST_KINDS.join(", ")}`);
      return;
    }
    const name = str(s.name) ?? `${KIND_LABELS[s.kind]} suite`;
    const notApplicable = str(s.not_applicable);
    const command = str(s.command);
    if (!command && !notApplicable) {
      rejected.push(
        `#${i} (${name}): command is required unless not_applicable is given`,
      );
      return;
    }
    const results: SuitePlan["results"] = [];
    if (Array.isArray(s.results)) {
      for (const r of s.results) {
        const ro = obj(r);
        const path = ro ? str(ro.path) : typeof r === "string" ? r : undefined;
        if (!path || !SAFE_PATH.test(path) || path.includes("..")) {
          rejected.push(`#${i} (${name}): bad result path ${String(path)}`);
          continue;
        }
        const format = ro && isArtifactFormat(ro.format) ? ro.format : "auto";
        results.push({ path, format });
      }
    }
    const env = obj(s.env);
    suites.push({
      id: str(s.id) ? slugId(str(s.id)!) : slugId(`${s.kind}-${name}`),
      kind: s.kind,
      name,
      command: command ?? "",
      cwd: str(s.cwd),
      env: env
        ? Object.fromEntries(
            Object.entries(env).filter(([, v]) => typeof v === "string") as [
              string,
              string,
            ][],
          )
        : undefined,
      timeoutSec: num(s.timeout_sec),
      setup: str(s.setup),
      teardown: str(s.teardown),
      results,
      targets: strList(s.targets),
      rationale: str(s.rationale)?.slice(0, 500),
      origin: s.origin === "existing" ? "existing" : "agent",
      notApplicable,
      evidence: strList(s.evidence),
    });
  });
  return { suites, rejected };
}

function parseOptions(raw: unknown): ChoiceOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(obj)
    .filter(
      (o): o is Record<string, unknown> => !!o && !!str(o.id) && !!str(o.label),
    )
    .map((o) => ({
      id: str(o.id)!,
      label: str(o.label)!,
      description: str(o.description),
      recommended: o.recommended === true,
    }));
}

function parseFindings(
  raw: unknown,
  at: string,
): { findings: Finding[]; rejected: string[] } {
  const findings: Finding[] = [];
  const rejected: string[] = [];
  if (!Array.isArray(raw))
    return { findings, rejected: ["findings must be an array"] };
  raw.forEach((item, i) => {
    const f = obj(item);
    if (
      !f ||
      !str(f.title) ||
      !severityOf(f.severity) ||
      !isTestKind(f.kind) ||
      !str(f.description)
    ) {
      rejected.push(`#${i}: needs title, severity, kind, description`);
      return;
    }
    const evidence = strList(f.evidence);
    if (evidence.length === 0) {
      rejected.push(
        `#${i} (${str(f.title)}): evidence is required (a test name, a file:line, an artifact path)`,
      );
      return;
    }
    findings.push({
      id: str(f.id) ? slugId(str(f.id)!) : slugId(`${f.kind}-${str(f.title)}`),
      title: str(f.title)!.slice(0, 200),
      severity: severityOf(f.severity)!,
      kind: f.kind,
      description: str(f.description)!.slice(0, 2000),
      file: str(f.file),
      line: num(f.line),
      suite: str(f.suite),
      test: str(f.test),
      evidence,
      status:
        f.status === "fixed" || f.status === "wontfix" ? f.status : "open",
      at,
    });
  });
  return { findings, rejected };
}

/* ── Running ───────────────────────────────────────────────────────────── */

export type RunOutcome =
  | { ok: true; run: TestRun; report: TestReport }
  | {
      ok: false;
      reason:
        | "no_runtime"
        | "no_plan"
        | "unknown_suites"
        | "install_failed"
        | "start_failed"
        | "already_running";
      detail?: string;
    };

/**
 * Executes suites with the harness and records the run. Shared by the
 * agent's `run` command and the workbench's Run buttons.
 */
export async function executeRun(
  projectId: string,
  options: {
    suiteIds?: string[];
    retries?: number;
    triggeredBy: TestReport["trigger"];
    runInWorkspace?: RunInWorkspace;
    now?: () => number;
    poll?: DispatchContext["poll"];
  },
): Promise<RunOutcome> {
  const store = useTestStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return { ok: false, reason: "no_plan" };
  const run = options.runInWorkspace;
  if (!run) return { ok: false, reason: "no_runtime" };
  const applicable = project.plan.filter((s) => !s.notApplicable);
  if (applicable.length === 0) return { ok: false, reason: "no_plan" };
  const wanted = options.suiteIds?.length
    ? options.suiteIds
    : applicable.map((s) => s.id);
  const unknown = wanted.filter((id) => !applicable.some((s) => s.id === id));
  if (unknown.length)
    return { ok: false, reason: "unknown_suites", detail: unknown.join(", ") };
  if (project.runs.some((r) => r.status === "running")) {
    return { ok: false, reason: "already_running" };
  }
  const nowMs = options.now ?? Date.now;
  const startedAt = new Date(nowMs()).toISOString();
  const runId = `run-${startedAt.replace(/[:.]/g, "-").slice(0, 19)}-${newTestId("x").slice(2, 6)}`;

  if (!(await installHarness(run)))
    return { ok: false, reason: "install_failed" };
  if (!(await writePlan(run, project.plan)))
    return { ok: false, reason: "install_failed", detail: "plan" };

  const testRun: TestRun = {
    id: runId,
    startedAt,
    status: "running",
    suiteIds: wanted,
    triggeredBy: options.triggeredBy,
    progress: Object.fromEntries(wanted.map((id) => [id, "pending"])),
  };
  store.addRun(projectId, testRun);
  store.setStatus(projectId, "running");
  store.appendLog(projectId, {
    id: newTestId("log"),
    level: "info",
    text: `Run ${runId}: ${wanted.length} suite(s) — ${harnessCommand(runId, options.suiteIds)}`,
    at: startedAt,
  });

  const started = await startRun(
    run,
    runId,
    options.suiteIds?.length ? wanted : undefined,
  );
  if (!started.ok) {
    store.updateRun(projectId, runId, {
      status: "failed",
      error: started.error,
      finishedAt: new Date(nowMs()).toISOString(),
    });
    store.setStatus(projectId, "ready");
    return { ok: false, reason: "start_failed", detail: started.error };
  }

  const { status, timedOut } = await waitForStatus(run, runId, {
    timeoutMs: options.poll?.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS,
    intervalMs: options.poll?.intervalMs,
    sleep: options.poll?.sleep,
    now: nowMs,
    onProgress: (s) => {
      useTestStudioStore.getState().updateRun(projectId, runId, {
        progress: Object.fromEntries(s.suites.map((x) => [x.id, x.status])),
      });
      for (const suite of s.suites) {
        if (suite.status !== "pending" && suite.status !== "running") {
          const plan = project.plan.find((p) => p.id === suite.id);
          useTestStudioStore.getState().appendLog(projectId, {
            id: newTestId("log"),
            level: suite.status === "passed" ? "success" : "error",
            text: `${plan?.name ?? suite.id}: ${suite.status}${suite.durationMs !== undefined ? ` in ${Math.round(suite.durationMs / 1000)}s` : ""}`,
            at: suite.finishedAt ?? new Date(nowMs()).toISOString(),
          });
        }
      }
    },
  });

  // Parse what the harness collected (even on timeout, for finished suites).
  const artifactsBySuite: Record<string, ParsedArtifact[]> = {};
  for (const suite of status?.suites ?? []) {
    const parsed: ParsedArtifact[] = [];
    for (const artifact of suite.artifacts) {
      if (artifact.missing) continue;
      const text = await readArtifact(run, artifact.path);
      if (text === null) {
        parsed.push({
          path: artifact.path,
          format: artifact.format,
          warnings: [`${artifact.path}: unreadable`],
        });
        continue;
      }
      parsed.push(parseArtifact(artifact.path, text, artifact.format));
    }
    artifactsBySuite[suite.id] = parsed;
  }
  const finishedAt = new Date(nowMs()).toISOString();
  const fresh = useTestStudioStore.getState().projects[projectId] ?? project;
  const previous = latestReport({
    runs: fresh.runs.filter((r) => r.id !== runId),
  });
  const report = buildReport({
    runId,
    projectId,
    plan: fresh.plan,
    executed: wanted,
    status,
    artifactsBySuite,
    gates: fresh.gates,
    previous,
    trigger: options.triggeredBy,
    startedAt,
    finishedAt,
  });
  // Mutation proofs stay valid until the code changes: merge every proof
  // recorded on this commit into the new report so the gate keeps reading.
  const sameCode = (r: TestReport) =>
    report.treeHash
      ? r.treeHash === report.treeHash
      : Boolean(report.commit) && r.commit === report.commit;
  if (!report.mutation && (report.treeHash || report.commit)) {
    const proofs = fresh.runs
      .map((r) => r.report)
      .filter(
        (r): r is TestReport =>
          !!r?.mutation && sameCode(r) && r.runId !== runId,
      )
      .map((r) => r.mutation!);
    if (proofs.length) {
      const merged = proofs.reduce((acc, m) => ({
        total: acc.total + m.total,
        killed: acc.killed + m.killed,
        survived: acc.survived + m.survived,
        timeout: acc.timeout + m.timeout,
        noCoverage: acc.noCoverage + m.noCoverage,
        score: undefined,
        survivors: [...acc.survivors, ...m.survivors].slice(0, 50),
        source: m.source,
      }));
      const detectable = merged.killed + merged.survived + merged.timeout;
      merged.score =
        detectable > 0
          ? ((merged.killed + merged.timeout) / detectable) * 100
          : undefined;
      report.mutation = merged;
      report.gates = evaluateGates(report, fresh.gates);
    }
  }
  if (timedOut)
    report.warnings.unshift(
      `harness did not finish within ${Math.round((options.poll?.timeoutMs ?? DEFAULT_RUN_TIMEOUT_MS) / 60000)} minutes; partial results`,
    );
  const written = await writeReportFiles(
    run,
    report,
    reportMarkdown(report, fresh.name),
    JSON.stringify(toCtrf(report, fresh.name), null, 2),
  );
  if (written.length === 0)
    report.warnings.push("report files could not be written to the workspace");
  const updated = useTestStudioStore.getState().updateRun(projectId, runId, {
    status: timedOut ? "timeout" : "done",
    finishedAt,
    report,
    progress: Object.fromEntries(
      (status?.suites ?? []).map((x) => [x.id, x.status]),
    ),
  });
  useTestStudioStore.getState().setStatus(projectId, "reporting");
  openFailureTriage(projectId, report, finishedAt);
  useTestStudioStore.getState().appendLog(projectId, {
    id: newTestId("log"),
    level:
      report.gates.verdict === "failed"
        ? "error"
        : report.gates.verdict === "warned"
          ? "warn"
          : "success",
    text: reportHeadline(report),
    at: finishedAt,
  });
  return {
    ok: true,
    run: updated ?? { ...testRun, status: "done", report },
    report,
  };
}

/** Ids of the triage card's options; the brief documents their meaning. */
export const TRIAGE_OPTIONS = [
  "fix_app",
  "fix_tests",
  "findings_only",
] as const;
export type TriageOption = (typeof TRIAGE_OPTIONS)[number];
export const TRIAGE_QUESTION_PREFIX = "triage-";

/**
 * Failed tests or a failed gate are the user's call, not the agent's: the
 * studio opens a card asking whether Neo should fix the application, fix
 * the tests, or only record findings. One open triage at a time; the
 * answer reaches the agent as an ordinary card receipt.
 */
export function openFailureTriage(
  projectId: string,
  report: TestReport,
  at: string,
): boolean {
  const failed = report.counts.failed + report.counts.error;
  const gatesFailed = report.gates.results.filter(
    (g) => g.verdict === "failed",
  );
  if (failed === 0 && gatesFailed.length === 0) return false;
  const store = useTestStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return false;
  if (
    project.questions.some(
      (q) => q.status === "open" && q.id.startsWith(TRIAGE_QUESTION_PREFIX),
    )
  ) {
    return false;
  }
  const failures = report.suites
    .flatMap((s) =>
      s.cases
        .filter((c) => c.status === "failed" || c.status === "error")
        .map((c) => `${s.name}: ${c.name}`),
    )
    .slice(0, 8);
  store.askQuestion(projectId, {
    id: `${TRIAGE_QUESTION_PREFIX}${report.runId}`,
    askedBy: "studio",
    title: `${failed} test(s) failed, ${gatesFailed.length} gate(s) failed`,
    titleKey: "TESTING$TRIAGE_TITLE",
    prompt: failures.join("\n"),
    promptKey: "TESTING$TRIAGE_PROMPT",
    values: {
      failed,
      gates: gatesFailed.length,
      run: report.runId,
      failures: failures.join("\n"),
      gateList: gatesFailed.map((g) => g.rule.id).join(", "),
    },
    kind: "single",
    options: [
      {
        id: "fix_app",
        label: "Fix the application",
        labelKey: "TESTING$TRIAGE_FIX_APP",
        descriptionKey: "TESTING$TRIAGE_FIX_APP_DESC",
        recommended: true,
      },
      {
        id: "fix_tests",
        label: "Fix the tests",
        labelKey: "TESTING$TRIAGE_FIX_TESTS",
        descriptionKey: "TESTING$TRIAGE_FIX_TESTS_DESC",
      },
      {
        id: "findings_only",
        label: "Record as findings only",
        labelKey: "TESTING$TRIAGE_FINDINGS_ONLY",
        descriptionKey: "TESTING$TRIAGE_FINDINGS_ONLY_DESC",
      },
    ],
    allowOther: true,
    status: "open",
    selected: [],
    at,
  });
  return true;
}

export type ProofOutcome =
  | {
      ok: true;
      killed: number;
      total: number;
      survivors: { line: number; mutator: string }[];
      runId: string;
    }
  | {
      ok: false;
      reason:
        | "no_runtime"
        | "unknown_suite"
        | "bad_file"
        | "start_failed"
        | "timeout"
        | "install_failed";
      detail?: string;
    };

export async function executeProof(
  projectId: string,
  options: {
    file: string;
    suiteId: string;
    maxMutants?: number;
    runInWorkspace?: RunInWorkspace;
    now?: () => number;
    poll?: DispatchContext["poll"];
  },
): Promise<ProofOutcome> {
  const store = useTestStudioStore.getState();
  const project = store.projects[projectId];
  const run = options.runInWorkspace;
  if (!project || !run) return { ok: false, reason: "no_runtime" };
  const suite = project.plan.find(
    (s) => s.id === options.suiteId && !s.notApplicable,
  );
  if (!suite) return { ok: false, reason: "unknown_suite" };
  if (!SAFE_PATH.test(options.file) || options.file.includes(".."))
    return { ok: false, reason: "bad_file" };
  if (!(await installHarness(run)) || !(await writePlan(run, project.plan)))
    return { ok: false, reason: "install_failed" };
  const nowMs = options.now ?? Date.now;
  const runId = `prove-${new Date(nowMs()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${newTestId("x").slice(2, 6)}`;
  store.appendLog(projectId, {
    id: newTestId("log"),
    level: "info",
    text: `Proof ${runId}: ${mutationCommand(runId, options.file, options.suiteId, options.maxMutants)}`,
    at: new Date(nowMs()).toISOString(),
  });
  const started = await startMutation(
    run,
    runId,
    options.file,
    options.suiteId,
    options.maxMutants,
  );
  if (!started.ok)
    return { ok: false, reason: "start_failed", detail: started.error };
  const { record, timedOut } = await waitForMutation(run, runId, {
    timeoutMs: options.poll?.timeoutMs,
    intervalMs: options.poll?.intervalMs,
    sleep: options.poll?.sleep,
    now: nowMs,
  });
  if (!record)
    return { ok: false, reason: timedOut ? "timeout" : "start_failed" };
  const summary = parseNeotestMutation(record);
  // Attach to the latest report so the gate and the trend see it.
  const fresh = useTestStudioStore.getState().projects[projectId];
  const last = fresh
    ? [...fresh.runs].reverse().find((r) => r.report)
    : undefined;
  if (fresh && last?.report) {
    const report: TestReport = { ...last.report, mutation: summary };
    report.gates = evaluateGates(report, fresh.gates);
    useTestStudioStore.getState().updateRun(projectId, last.id, { report });
    await writeReportFiles(
      run,
      report,
      reportMarkdown(report, fresh.name),
      JSON.stringify(toCtrf(report, fresh.name), null, 2),
    );
  }
  useTestStudioStore.getState().appendLog(projectId, {
    id: newTestId("log"),
    level: summary.survived === 0 ? "success" : "warn",
    text: `${options.file}: ${summary.killed}/${summary.total} mutants killed by ${suite.name}`,
    at: new Date(nowMs()).toISOString(),
  });
  return {
    ok: true,
    killed: summary.killed,
    total: summary.total,
    survivors: summary.survivors.map((s) => ({
      line: s.line ?? 0,
      mutator: s.mutator ?? "",
    })),
    runId,
  };
}

/**
 * Kinds the recorded stack can test may not be marked not_applicable: a
 * dependency audit exists for every ecosystem, and an app that starts over
 * HTTP has an API, flows and latency to test. The rejection names the
 * suite the agent should write instead.
 */
export function notApplicableRefusal(
  suite: SuitePlan,
  stack: StackInfo | null,
): string | null {
  if (!suite.notApplicable) return null;
  if (suite.kind === "security") {
    return "security is always applicable: run a dependency audit (npm audit --json, pip-audit -f json, govulncheck -json, cargo audit --json) and a static scan where available";
  }
  if (stack?.appStart && HTTP_KINDS.includes(suite.kind)) {
    return `${suite.kind} is applicable: the stack records an app that starts over HTTP (${stack.appStart.url}); write a suite that starts it in setup and tests it`;
  }
  return null;
}
const HTTP_KINDS: TestKind[] = ["api", "e2e", "performance"];

/* ── Completion ────────────────────────────────────────────────────────── */

/** What still blocks `complete`, in the words the receipt uses. */
export function completionBlockers(project: TestProject): string[] {
  const missing: string[] = [];
  if (!project.stack) missing.push("no_stack");
  const applicable = project.plan.filter((s) => !s.notApplicable);
  if (applicable.length === 0) missing.push("no_plan");
  const report = latestReport(project);
  if (!report) missing.push("no_run");
  else {
    const ran = new Set(
      project.runs.flatMap((r) =>
        r.report ? r.report.suites.map((s) => s.id) : [],
      ),
    );
    const never = applicable.filter((s) => !ran.has(s.id));
    if (never.length)
      missing.push(`suites_never_run:${never.map((s) => s.id).join(",")}`);
    if (report.gates.results.length === 0) missing.push("gates_not_evaluated");
    // Tests that never had to catch a bug prove nothing: at least one
    // prove run (or a mutation suite) is required when code-level suites exist.
    const codeLevel = applicable.some(
      (s) => s.kind === "unit" || s.kind === "integration",
    );
    const proven = project.runs.some((r) => r.report?.mutation);
    if (codeLevel && !proven) missing.push("no_mutation_proof");
  }
  if (project.runs.some((r) => r.status === "running"))
    missing.push("run_in_progress");
  if (project.questions.some((q) => q.status === "open"))
    missing.push("open_questions");
  return missing;
}

/* ── Auto-continue ─────────────────────────────────────────────────────── */

export const AUTO_CONTINUE_WINDOW_MS = 120_000;
export const AUTO_CONTINUE_MESSAGE =
  "Your input arrived in the receipt above (the card was answered). Call describe to re-read the project state, then continue with the next step now.";

export function shouldAutoContinue({
  agentIdle,
  lastReceiptAt,
  nudgedForReceiptAt,
  now,
  project,
}: {
  agentIdle: boolean;
  lastReceiptAt: number | null;
  nudgedForReceiptAt: number | null;
  now: number;
  project: Pick<TestProject, "status" | "questions">;
}): boolean {
  if (!agentIdle || lastReceiptAt === null) return false;
  if (nudgedForReceiptAt === lastReceiptAt) return false;
  if (now - lastReceiptAt > AUTO_CONTINUE_WINDOW_MS) return false;
  if (project.status === "done") return false;
  if (project.questions.some((q) => q.status === "open")) return false;
  return true;
}

export const MID_PLAN_MAX_NUDGES = 3;
export const MID_PLAN_CONTINUE_MESSAGE =
  "You ended your turn but the test report is not complete and nothing is waiting on me. Call describe if you need the state, then continue with the next step (stack, plan, gates, run, prove, findings, complete). Keep going until a card needs me or complete succeeds.";

export function shouldContinueMidPlan({
  agentIdle,
  idleAt,
  nudgedForIdleAt,
  nudgesWithoutProgress,
  lastAgentText,
  project,
}: {
  agentIdle: boolean;
  idleAt: number | null;
  nudgedForIdleAt: number | null;
  nudgesWithoutProgress: number;
  lastAgentText: string | null;
  project: TestProject;
}): boolean {
  if (!agentIdle || idleAt === null || nudgedForIdleAt === idleAt) return false;
  if (nudgesWithoutProgress >= MID_PLAN_MAX_NUDGES) return false;
  if (project.status === "done" || project.status === "failed") return false;
  if (project.runs.some((r) => r.status === "running")) return false;
  // Nothing blocks complete and the summary is filed: the agent is done.
  if (completionBlockers(project).length === 0 && project.report) return false;
  if (project.questions.some((q) => q.status === "open")) return false;
  if (lastAgentText?.trim().endsWith("?")) return false;
  return true;
}

/* ── Replay ────────────────────────────────────────────────────────────── */

function isTestReceiptMessage(event: OpenHandsEvent): boolean {
  if (!isMessageEvent(event) || event.source !== "user") return false;
  const content = (event as { llm_message?: { content?: unknown } }).llm_message
    ?.content;
  if (!Array.isArray(content)) return false;
  return content.some(
    (part) =>
      part &&
      typeof part === "object" &&
      typeof (part as { text?: unknown }).text === "string" &&
      (part as { text: string }).text
        .trimStart()
        .startsWith(TEST_RESULT_PREFIX),
  );
}

/**
 * Catch-up for commands the studio never saw while the tab was away. `run`
 * and `prove` are answered with a rejection (re-running them unasked would
 * start long jobs the agent did not request now); `log` is just marked.
 */
export async function replayMissedTestCommands(
  events: readonly OpenHandsEvent[],
  context: Omit<DispatchContext, "actionId">,
): Promise<string[]> {
  const project = findProjectForConversation(context.conversationId);
  if (!project) return [];
  const store = useTestStudioStore.getState();
  if (project.handledActionIds === undefined) {
    let lastReceipt = -1;
    events.forEach((event, i) => {
      if (isTestReceiptMessage(event)) lastReceipt = i;
    });
    events.slice(0, lastReceipt + 1).forEach((event) => {
      if (isTestControlActionEvent(event))
        store.markActionHandled(project.id, String(event.id));
    });
  }
  const handled = new Set(
    useTestStudioStore.getState().projects[project.id]?.handledActionIds ?? [],
  );
  const replayed: string[] = [];
  for (const event of events) {
    if (!isTestControlActionEvent(event)) continue;
    const id = String(event.id);
    if (handled.has(id)) continue;
    const command = event.action.command;
    if (command === "log") {
      store.markActionHandled(project.id, id);
      continue;
    }
    if (command === "run" || command === "prove") {
      if (store.markActionHandled(project.id, id)) {
        postReceipt(context, {
          status: "rejected",
          reason: "studio_was_away",
          guidance: `The studio was not open when this ${command} call arrived, so nothing ran. Call describe, then ${command} again.`,
        });
        replayed.push(id);
      }
      continue;
    }
    await handleTestControlAction(event.action, { ...context, actionId: id });
    replayed.push(id);
  }
  return replayed;
}

/** Files changed in the last commit plus the working tree, for test focus. */
async function readChangedFiles(run: RunInWorkspace): Promise<string[]> {
  try {
    const result = await run(
      "(git diff --name-only HEAD~1..HEAD 2>/dev/null; git status --porcelain 2>/dev/null | awk '{print $2}') | sort -u | head -60",
    );
    return (result.stdout ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith(".neotest"));
  } catch {
    return [];
  }
}

/* ── KT docs ───────────────────────────────────────────────────────────── */

/**
 * Finds the KT docs Neo already generated for the project (store, then
 * Supabase), writes them into the workspace when a runtime is attached, and
 * records the result on the project. Shared by `describe`, the studio's
 * mount-time sync and the KT card.
 */
export async function syncProjectKt(
  projectId: string,
  runtime?: TestRuntime,
): Promise<TestProject["kt"] | null> {
  const store = useTestStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return null;
  if (project.kt.status === "generating") return project.kt;
  const resolved = await resolveTestKnowledge(project.source);
  if (!resolved) {
    // A failed generation keeps its error on the card until docs exist.
    if (project.kt.status === "error") return project.kt;
    store.setKt(projectId, {
      status: "none",
      exportedCommit: project.kt.exportedCommit,
    });
    return useTestStudioStore.getState().projects[projectId]?.kt ?? null;
  }
  const summary = summarizeKnowledge(resolved.knowledge, resolved.from);
  let exportedCommit = project.kt.exportedCommit;
  if (runtime?.conversationUrl && runtime.workingDir) {
    exportedCommit = await ensureKtInWorkspace(
      runtime,
      resolved.knowledge,
      project.source,
    );
  }
  store.setKt(projectId, { ...summary, exportedCommit });
  return useTestStudioStore.getState().projects[projectId]?.kt ?? null;
}

/**
 * Generates KT docs for the project from the studio's own checkout, exports
 * them, and tells the agent. The knowledge store carries progress under
 * `knowledgeRepositoryId(source)` while it runs.
 */
export async function startKtGeneration(
  projectId: string,
  runtime: TestRuntime,
  run: RunInWorkspace,
  postResult?: PostResultFn,
): Promise<TestProject["kt"] | null> {
  const store = useTestStudioStore.getState();
  const project = store.projects[projectId];
  if (!project) return null;
  if (project.kt.status === "generating") return project.kt;
  store.setKt(projectId, { status: "generating", error: undefined });
  store.appendLog(projectId, {
    id: newTestId("log"),
    level: "info",
    text: `Generating KT docs for ${project.name} (${knowledgeRepositoryId(project.source)})`,
    at: new Date().toISOString(),
  });
  const outcome = await generateKtForProject(project.source, runtime, run);
  if (!outcome.ok) {
    useTestStudioStore.getState().setKt(projectId, {
      status: "error",
      error: outcome.detail ?? outcome.reason,
    });
    postResult?.(
      receipt({
        status: "kt_generation_failed",
        reason: outcome.reason,
        detail: outcome.detail,
        guidance:
          "Plan from the README, entry points and routes instead; KT docs can be generated later from the Knowledge page.",
      }),
    );
    return useTestStudioStore.getState().projects[projectId]?.kt ?? null;
  }
  const exportedCommit = await ensureKtInWorkspace(
    runtime,
    outcome.knowledge,
    project.source,
  );
  useTestStudioStore.getState().setKt(projectId, {
    ...summarizeKnowledge(outcome.knowledge, "generated"),
    exportedCommit,
  });
  useTestStudioStore.getState().appendLog(projectId, {
    id: newTestId("log"),
    level: "success",
    text: `KT docs ready: ${outcome.knowledge.pages.length} pages at .neodevex/kt/`,
    at: new Date().toISOString(),
  });
  postResult?.(
    receipt({
      status: "kt_docs_ready",
      index: ".neodevex/kt/INDEX.md",
      pages: outcome.knowledge.pages.length,
      commit: outcome.knowledge.commitSha,
      guidance:
        "Read .neodevex/kt/INDEX.md and the pages for the areas you will test, then refine the plan (set_plan) with what the architecture map shows.",
    }),
  );
  return useTestStudioStore.getState().projects[projectId]?.kt ?? null;
}

/* ── describe ──────────────────────────────────────────────────────────── */

function summarizeReport(report: TestReport) {
  return {
    run_id: report.runId,
    at: report.finishedAt,
    verdict: report.gates.verdict,
    headline: reportHeadline(report),
    tests: report.counts,
    pass_rate: passRate(report.counts),
    line_coverage: report.coverage?.lines.pct,
    p95_ms: report.perf.length
      ? Math.max(...report.perf.map((p) => p.p95Ms ?? 0))
      : undefined,
    data_checks: report.checks.length
      ? {
          total: report.checks.length,
          failed: report.checks.filter((c) => c.status !== "pass").length,
        }
      : undefined,
    security: report.security.length,
    accessibility: report.accessibility.length,
    mutation_score: report.mutation?.score,
    flaky: report.flaky.length,
    gates_failed: report.gates.results
      .filter((g) => g.verdict === "failed")
      .map((g) => `${g.rule.id}: ${g.detail}`),
    gates_warned: report.gates.results
      .filter((g) => g.verdict === "warned")
      .map((g) => `${g.rule.id}: ${g.detail}`),
    suites: report.suites.map((s) => ({
      id: s.id,
      kind: s.kind,
      status: s.status,
      tests: s.counts.total,
      failed: s.counts.failed + s.counts.error,
      exit_code_only: s.exitCodeOnly || undefined,
      warnings: s.warnings.length ? s.warnings.slice(0, 5) : undefined,
    })),
    failures: report.suites
      .flatMap((s) =>
        s.cases
          .filter((c) => c.status === "failed" || c.status === "error")
          .map((c) => ({
            suite: s.id,
            test: c.name,
            file: c.file,
            line: c.line,
            message: c.message?.slice(0, 300),
          })),
      )
      .slice(0, 30),
    kinds_not_run: report.kindsNotRun,
    trend: report.trend,
  };
}

async function describeProject(
  project: TestProject,
  run: RunInWorkspace | undefined,
  runtime?: TestRuntime,
) {
  let stackHint: ReturnType<typeof detectStack> | undefined;
  let ktDocs = false;
  let synthDirs: string[] = [];
  let changedFiles: string[] = [];
  if (run) {
    try {
      const listing = await run(STACK_FIND_COMMAND);
      const files = (listing.stdout ?? "")
        .split("\n")
        .map((l) => l.trim().replace(/^\.\//, ""))
        .filter(Boolean);
      let pkg: unknown;
      if (files.includes("package.json")) {
        const text = await readWorkspaceFile(run, "package.json", 200_000);
        try {
          pkg = text ? JSON.parse(text) : undefined;
        } catch {
          pkg = undefined;
        }
      }
      stackHint = detectStack(files, pkg);
    } catch {
      stackHint = undefined;
    }
    ktDocs = await hasKtDocs(run);
    synthDirs = await listSynthRunsInWorkspace(run);
    changedFiles = await readChangedFiles(run);
  }
  const kt = (await syncProjectKt(project.id, runtime)) ?? project.kt;
  const synthProjects = Object.values(
    useSynthStudioStore.getState().projects,
  ).filter((p) => p.source.name === project.source.name);
  const synthRuns = synthProjects.flatMap((p) =>
    p.runs
      .filter((r) => r.validation.ok)
      .map((r) => ({
        project: p.name,
        run_id: r.id,
        scenario: r.scenarioId,
        rows: r.rowsTotal,
        dir: r.workspaceDir,
        verified: Boolean(
          r.verification &&
          ((r.verification.rowsLoaded ?? 0) > 0 ||
            (r.verification.testsTotal ?? 0) > 0),
        ),
        formats: r.formats,
      })),
  );
  const latest = latestReport(project);
  const languages = project.stack?.languages ?? stackHint?.languages ?? [];
  const catalog = catalogByKind(languages);
  return {
    // Open-source tools (MIT first) per kind for the recorded stack, with
    // the exact invocation that writes a result the studio parses.
    tool_catalog: Object.fromEntries(
      TEST_KINDS.map((kind) => [
        kind,
        (catalog[kind] ?? []).slice(0, 6).map((tool) => ({
          id: tool.id,
          name: tool.name,
          license: tool.license,
          mit: tool.mit,
          command: tool.command,
          result: tool.result,
          generates: tool.generates,
          needs: tool.needs,
          notes: tool.notes,
        })),
      ]),
    ),
    // Where to aim new tests: least covered files and recent changes.
    coverage_gaps: latest?.coverage?.hotspots.slice(0, 10),
    changed_files: changedFiles,
    failing_tests: latest
      ? latest.suites
          .flatMap((s) =>
            s.cases
              .filter((c) => c.status === "failed" || c.status === "error")
              .map((c) => ({
                suite: s.id,
                test: c.name,
                file: c.file,
                line: c.line,
              })),
          )
          .slice(0, 30)
      : [],
    project: {
      id: project.id,
      name: project.name,
      source: project.source,
      status: project.status,
    },
    resumed:
      Boolean(project.stack) ||
      project.plan.length > 0 ||
      project.runs.length > 0,
    stack: project.stack,
    stack_hints: stackHint
      ? {
          languages: stackHint.languages,
          frameworks: stackHint.frameworks,
          runners: stackHint.runners,
          ci: stackHint.ci,
          evidence: stackHint.evidence,
          suggested_suites: stackHint.suggestions,
        }
      : undefined,
    kt_docs: {
      // Neo's own Knowledge module: generated architecture pages for this
      // repository, not the repository's markdown.
      status: kt.status,
      generated_in_neo: kt.status === "available",
      source: kt.from,
      commit: kt.commitSha,
      generated_at: kt.generatedAt,
      present_in_workspace: ktDocs || Boolean(kt.exportedCommit),
      index: ".neodevex/kt/INDEX.md",
      pages: kt.pages?.slice(0, 40),
      guidance:
        kt.status === "available"
          ? "Neo already generated KT docs for this project. Read the index and the high-importance pages for the areas you will test BEFORE planning; cite pages as evidence."
          : kt.status === "generating"
            ? "KT docs are being generated right now; a kt_docs_ready receipt will arrive. Continue discovery from the README and entry points meanwhile."
            : "No KT docs exist yet. Call describe {generate_kt: true} to have Neo generate them from this checkout (takes a few minutes; a kt_docs_ready receipt arrives) and continue discovery from the README, entry points and routes meanwhile.",
    },
    synth_data: {
      datasets: synthRuns,
      workspace_dirs: synthDirs,
      guidance:
        synthRuns.length || synthDirs.length
          ? "Use these datasets for data and load tests: load seed.*.sql / data/*.json into a fresh database, point the suites at it, and write data checks against the rules Synth recorded."
          : "No Neo Synth dataset for this source yet. For data suites that need rows, ask the user (ask_choice) whether to generate one on the Synth page, or use the project's own fixtures.",
    },
    plan: project.plan.map((s) => ({
      id: s.id,
      kind: s.kind,
      name: s.name,
      command: s.command,
      results: s.results,
      origin: s.origin,
      not_applicable: s.notApplicable,
      timeout_sec: s.timeoutSec,
    })),
    kinds_without_suite: TEST_KINDS.filter(
      (k) => !project.plan.some((s) => s.kind === k),
    ),
    gates: project.gates.map((g) => ({ ...g, label: METRIC_LABELS[g.metric] })),
    runs: project.runs.map((r) => ({
      run_id: r.id,
      status: r.status,
      triggered_by: r.triggeredBy,
      suites: r.suiteIds,
      verdict: r.report?.gates.verdict,
      headline: r.report ? reportHeadline(r.report) : undefined,
    })),
    latest_report: latest ? summarizeReport(latest) : undefined,
    findings: project.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      kind: f.kind,
      status: f.status,
    })),
    open_questions: project.questions
      .filter((q) => q.status === "open")
      .map((q) => q.id),
    answers: project.questions
      .filter((q) => q.status === "answered")
      .map((q) => ({
        question_id: q.id,
        title: q.title,
        selected: q.selected,
        other: q.other,
      })),
    schedule: project.schedule
      ? {
          automation_id: project.schedule.automationId,
          description: project.schedule.description,
        }
      : undefined,
    report: project.report,
    paths: {
      dir: NEOTEST_DIR,
      harness: HARNESS_PATH,
      plan: PLAN_PATH,
      results: RESULTS_DIR,
      report_md: REPORT_MD_PATH,
      latest_json: LATEST_JSON_PATH,
    },
    completion_blockers: completionBlockers(project),
    commands: COMMAND_SHAPES,
  };
}

/** The runtime with its working directory resolved (once per call). */
async function resolveRuntime(
  context: DispatchContext,
): Promise<TestRuntime | undefined> {
  if (!context.runtime) return undefined;
  if (context.runtime.workingDir || !context.conversationId)
    return context.runtime;
  try {
    const workingDir =
      await AgentServerConversationService.resolveConversationWorkingDir(
        context.conversationId,
      );
    return { ...context.runtime, workingDir };
  } catch {
    return context.runtime;
  }
}

/* ── Dispatcher ────────────────────────────────────────────────────────── */

export async function handleTestControlAction(
  action: TestControlAction,
  context: DispatchContext,
): Promise<void> {
  const store = useTestStudioStore.getState();
  const payload = payloadOf(action);

  if (!isCommand(action.command)) {
    postReceipt(context, {
      status: "rejected",
      reason: "unknown_command",
      valid_commands: TEST_CONTROL_COMMANDS,
    });
    return;
  }
  const project = findProjectForConversation(context.conversationId);
  if (!project) {
    postReceipt(context, {
      status: "rejected",
      reason: "no_project",
      guidance:
        "This conversation is not attached to a Neo Test project. Ask the user to open the studio from the Test page.",
    });
    return;
  }
  const projectId = project.id;
  if (context.actionId && !store.markActionHandled(projectId, context.actionId))
    return;
  const nowMs = context.now ?? Date.now;
  const now = new Date(nowMs()).toISOString();
  const log = (level: "info" | "warn" | "error" | "success", text: string) =>
    store.appendLog(projectId, {
      id: newTestId("log"),
      level,
      text: text.slice(0, 400),
      at: now,
    });

  switch (action.command) {
    case "describe": {
      if (payload.generate_kt === true && context.runInWorkspace) {
        const runtime = await resolveRuntime(context);
        if (runtime?.conversationUrl && runtime.workingDir) {
          // Fire and forget: the receipt arrives when the docs are ready.
          void startKtGeneration(
            projectId,
            runtime,
            context.runInWorkspace,
            context.postResult,
          );
        }
      }
      postReceipt(context, {
        status: "ok",
        ...(await describeProject(
          project,
          context.runInWorkspace,
          await resolveRuntime(context),
        )),
      });
      return;
    }

    case "record_stack": {
      const secrets = scanForSecrets(payload);
      if (!secrets.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "secret_detected",
          at: secrets.at,
          guidance:
            "Never record credentials or connection strings; reference them by environment-variable name.",
        });
        return;
      }
      const stack = parseStack(payload, now);
      if (!stack) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_languages",
          shape: COMMAND_SHAPES.record_stack,
        });
        return;
      }
      if (stack.evidence.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_evidence",
          guidance:
            "List the files that prove the stack (package.json, pyproject.toml, config files).",
        });
        return;
      }
      store.setStack(projectId, stack);
      if (project.status === "intake" || project.status === "discovering")
        store.setStatus(projectId, "planning");
      log(
        "success",
        `Stack recorded: ${stack.languages.join(", ")}${stack.runners.length ? ` · ${stack.runners.join(", ")}` : ""}`,
      );
      postReceipt(context, {
        status: "ok",
        recorded: {
          languages: stack.languages,
          runners: stack.runners,
          existing_suites: stack.existingSuites.length,
        },
        guidance:
          "Now set_plan: one suite per kind you can run here, with result files under .neotest/results/; mark kinds that do not apply with not_applicable and a reason.",
      });
      return;
    }

    case "set_plan": {
      if (!project.stack) {
        postReceipt(context, {
          status: "rejected",
          reason: "stack_required",
          guidance:
            "Call record_stack first so the plan is grounded in the real runners and commands.",
        });
        return;
      }
      const parsed = parseSuites(payload.suites);
      const { rejected } = parsed;
      const suites = parsed.suites.filter((s) => {
        const refusal = notApplicableRefusal(s, project.stack);
        if (refusal) rejected.push(`${s.id}: ${refusal}`);
        return !refusal;
      });
      if (suites.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_suites",
          rejected,
          shape: COMMAND_SHAPES.set_plan,
        });
        return;
      }
      const withoutResults = suites.filter(
        (s) =>
          !s.notApplicable && s.results.length === 0 && s.kind !== "mutation",
      );
      store.upsertSuites(projectId, suites, {
        replace: payload.replace === true,
      });
      const fresh = useTestStudioStore.getState().projects[projectId];
      if (fresh && fresh.status !== "running" && fresh.status !== "done")
        store.setStatus(projectId, "ready");
      log(
        "success",
        `Plan: ${suites.length} suite(s) ${payload.replace === true ? "set" : "added"}`,
      );
      postReceipt(context, {
        status: "ok",
        plan: fresh?.plan.map((s) => ({
          id: s.id,
          kind: s.kind,
          name: s.name,
          not_applicable: s.notApplicable,
        })),
        rejected: rejected.length ? rejected : undefined,
        warnings: withoutResults.length
          ? withoutResults.map(
              (s) =>
                `${s.id}: no result files declared; only its exit code will count (add a JUnit/JSON reporter)`,
            )
          : undefined,
        kinds_without_suite: TEST_KINDS.filter(
          (k) => !fresh?.plan.some((s) => s.kind === k),
        ),
        guidance:
          "Review gates with set_gates if the defaults do not fit, then run. Make sure the commands write the result files you declared.",
      });
      return;
    }

    case "set_gates": {
      const base =
        payload.reset_defaults === true
          ? DEFAULT_GATES.map((g) => ({ ...g }))
          : project.gates;
      const { rules, rejected } = normalizeGates(payload.gates ?? []);
      const byId = new Map<string, GateRule>(base.map((g) => [g.id, g]));
      for (const rule of rules) byId.set(rule.id, rule);
      const gates = [...byId.values()];
      if (project.runs.some((r) => r.status === "running")) {
        postReceipt(context, {
          status: "rejected",
          reason: "run_in_progress",
          guidance: "Gates cannot change while a run is in progress.",
        });
        return;
      }
      store.setGates(projectId, gates);
      log("info", `Gates: ${gates.length} rule(s)`);
      postReceipt(context, {
        status: "ok",
        gates: gates.map((g) => ({ ...g, label: METRIC_LABELS[g.metric] })),
        rejected: rejected.length ? rejected : undefined,
      });
      return;
    }

    case "ask_choice": {
      const questionId = str(payload.question_id);
      const title = str(payload.title);
      const options = parseOptions(payload.options);
      if (!questionId || !title || options.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "invalid_question",
          shape: COMMAND_SHAPES.ask_choice,
        });
        return;
      }
      const existing = project.questions.find((q) => q.id === questionId);
      if (existing?.status === "answered") {
        postReceipt(context, {
          status: "answered",
          question_id: questionId,
          selected: existing.selected,
          other: existing.other,
          note: "already answered",
        });
        return;
      }
      const question: ChoiceQuestion = {
        id: questionId,
        title,
        prompt: str(payload.prompt),
        kind: payload.kind === "multi" ? "multi" : "single",
        options,
        allowOther: payload.allow_other === true,
        status: "open",
        selected: [],
        at: now,
      };
      store.askQuestion(projectId, question);
      log("info", `Asked: ${title}`);
      postReceipt(context, {
        status: "pending_user",
        question_id: questionId,
        guidance:
          "Wait for the user's answer; it arrives as a receipt with status 'answered'. Do not call run or complete meanwhile.",
      });
      return;
    }

    case "run": {
      const suiteIds = strList(payload.suite_ids);
      const outcome = await executeRun(projectId, {
        suiteIds: suiteIds.length ? suiteIds : undefined,
        retries: Math.min(2, Math.max(0, num(payload.retries) ?? 0)),
        triggeredBy: "agent",
        runInWorkspace: context.runInWorkspace,
        now: context.now,
        poll: context.poll,
      });
      if (!outcome.ok) {
        const guidance: Record<typeof outcome.reason, string> = {
          no_runtime:
            "The studio cannot reach the workspace right now; try again in a few seconds.",
          no_plan: "set_plan first (with at least one applicable suite).",
          unknown_suites: "suite_ids must be ids from the plan (see describe).",
          install_failed:
            "The harness could not be written to the workspace; is the working directory writable and a git checkout?",
          start_failed:
            "The harness could not start. Is `node` available in the runtime?",
          already_running:
            "A run is already in progress; wait for its receipt.",
        };
        postReceipt(context, {
          status: "rejected",
          reason: outcome.reason,
          detail: outcome.detail,
          guidance: guidance[outcome.reason],
        });
        return;
      }
      postReceipt(context, {
        status: outcome.run.status === "timeout" ? "partial" : "ok",
        ...summarizeReport(outcome.report),
        report_md: REPORT_MD_PATH,
        report_json: `${NEOTEST_DIR}/runs/${outcome.report.runId}/report.json`,
        warnings: outcome.report.warnings.length
          ? outcome.report.warnings.slice(0, 12)
          : undefined,
        guidance:
          outcome.report.gates.verdict === "failed"
            ? "Gates failed. Read the failures (and the suite stdout tails in status.json), fix tests or record_finding for real bugs, then run again."
            : outcome.report.suites.some((s) => s.exitCodeOnly)
              ? "Some suites produced no parseable results; add a JUnit/JSON reporter to their command so tests are counted."
              : "Prove new tests with prove on the files they cover, record findings for bugs they exposed, then complete.",
      });
      return;
    }

    case "prove": {
      const file = str(payload.file);
      const suiteId = str(payload.suite_id);
      if (!file || !suiteId) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_fields",
          shape: COMMAND_SHAPES.prove,
        });
        return;
      }
      const outcome = await executeProof(projectId, {
        file,
        suiteId,
        maxMutants: Math.min(12, Math.max(1, num(payload.max_mutants) ?? 6)),
        runInWorkspace: context.runInWorkspace,
        now: context.now,
        poll: context.poll,
      });
      if (!outcome.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: outcome.reason,
          detail: outcome.detail,
          shape: COMMAND_SHAPES.prove,
        });
        return;
      }
      postReceipt(context, {
        status: "ok",
        file,
        suite_id: suiteId,
        killed: outcome.killed,
        total: outcome.total,
        survivors: outcome.survivors,
        guidance:
          outcome.total === 0
            ? "No mutable operators found in that file; pick a file with conditions or arithmetic."
            : outcome.survivors.length
              ? "Survivors are behaviour the suite does not check. Add assertions for those lines, run, and prove again."
              : "Every mutant was killed: the suite detects changes in this file.",
      });
      return;
    }

    case "record_finding": {
      const secrets = scanForSecrets(payload);
      if (!secrets.ok) {
        postReceipt(context, {
          status: "rejected",
          reason: "secret_detected",
          at: secrets.at,
        });
        return;
      }
      const { findings, rejected } = parseFindings(payload.findings, now);
      if (findings.length === 0) {
        postReceipt(context, {
          status: "rejected",
          reason: "no_valid_findings",
          rejected,
          shape: COMMAND_SHAPES.record_finding,
        });
        return;
      }
      store.upsertFindings(projectId, findings);
      log(
        findings.some((f) => f.severity === "critical" || f.severity === "high")
          ? "error"
          : "warn",
        `${findings.length} finding(s) recorded`,
      );
      postReceipt(context, {
        status: "ok",
        recorded: findings.map((f) => ({ id: f.id, severity: f.severity })),
        rejected: rejected.length ? rejected : undefined,
      });
      return;
    }

    case "log": {
      const text = str(payload.text);
      if (!text) return;
      const level =
        payload.level === "warn" ||
        payload.level === "error" ||
        payload.level === "success"
          ? payload.level
          : "info";
      log(level, text);
      return;
    }

    case "complete": {
      const blockers = completionBlockers(project);
      if (blockers.length) {
        postReceipt(context, {
          status: "rejected",
          reason: "not_complete",
          blockers,
          guidance:
            "Every applicable suite must have run at least once, the latest run's gates must be evaluated, at least one prove run must exist when unit/integration suites do, and no card may be open. Run the missing suites, prove the files your tests cover, then complete.",
        });
        return;
      }
      const summary = str(payload.summary);
      if (!summary) {
        postReceipt(context, {
          status: "rejected",
          reason: "missing_summary",
          shape: COMMAND_SHAPES.complete,
        });
        return;
      }
      const latest = latestReport(project)!;
      store.setReport(projectId, {
        summary: summary.slice(0, 4000),
        artifacts: [REPORT_MD_PATH, ...strList(payload.artifacts)].filter(
          (v, i, a) => a.indexOf(v) === i,
        ),
        at: now,
      });
      log("success", `Complete: ${reportHeadline(latest)}`);
      postReceipt(context, {
        status: "ok",
        verdict: latest.gates.verdict,
        headline: reportHeadline(latest),
        report_md: REPORT_MD_PATH,
      });
      return;
    }

    default:
      return;
  }
}
