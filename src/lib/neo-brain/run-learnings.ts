/**
 * Learns from what runs prove: a command that failed because of the
 * environment, followed by a different command for the same job that worked.
 * "`npm test` is not how this repo tests; `pnpm test` is" is exactly the thing
 * every new agent rediscovers by failing first.
 *
 * Only tooling failures count (command not found, missing script, missing
 * module...). A test suite that fails because the code is broken and passes
 * after a fix teaches nothing about the workspace, and must not produce a
 * "use the other command" learning.
 */
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import type { MemoryCandidate } from "#/lib/workspace-memory/types";

import { learningKey } from "./learning-key";
import type { BrainLearning } from "./types";

export type CommandIntent =
  | "test"
  | "build"
  | "lint"
  | "typecheck"
  | "install"
  | "start"
  | "format";

export interface RunObservation {
  command: string | null;
  exitCode: number | null;
  /** Tail of the output; only scanned for tooling-error signatures. */
  output?: string;
  eventId?: string;
  observedAt?: string;
}

export interface RunContext {
  workspaceId: string;
  conversationId: string | null;
  repositoryId?: string;
}

const INTENTS: Array<[CommandIntent, RegExp]> = [
  [
    "install",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:install|i|ci|add)|pip3?\s+install|uv\s+(?:sync|pip)|poetry\s+install|bundle\s+install|go\s+mod\s+download|cargo\s+fetch)\b/,
  ],
  [
    "typecheck",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:typecheck|type-check|tsc)|npx\s+tsc|tsc|mypy|pyright)\b/,
  ],
  [
    "lint",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?lint|npx\s+eslint|eslint|ruff(?:\s+check)?|flake8|golangci-lint|cargo\s+clippy)\b/,
  ],
  [
    "format",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?format|npx\s+prettier|prettier|black|ruff\s+format|gofmt|cargo\s+fmt)\b/,
  ],
  [
    "test",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test|npx\s+(?:vitest|jest|playwright)|vitest|jest|pytest|python3?\s+-m\s+pytest|uv\s+run\s+pytest|go\s+test|cargo\s+test|mvn\s+test|gradle\s+test|make\s+test|tox|node\s+--test|deno\s+test)\b/,
  ],
  [
    "build",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?build|go\s+build|cargo\s+build|mvn\s+(?:package|install)|gradle\s+build|make(?:\s+build)?$)/,
  ],
  [
    "start",
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start)|python3?\s+manage\.py\s+runserver|flask\s+run|uvicorn|go\s+run|cargo\s+run)\b/,
  ],
];

const TOOLING_FAILURE =
  /command not found|missing script|not found:|is not recognized|no such file or directory|ERR_PNPM|ENOENT|ModuleNotFoundError|No module named|Cannot find module|unknown command|unrecognized arguments|requires a lockfile|This project is configured to use|Unsupported engine|EBADENGINE|externally-managed-environment/i;

function cleanCommand(command: string | null | undefined): string | null {
  const trimmed = command?.trim();
  if (!trimmed || trimmed.length > 200 || trimmed.includes("\n")) return null;
  if (!scanForSecrets(trimmed).ok) return null;
  if (/(?:token|secret|password|api[-_]?key)\s*[=:]/i.test(trimmed))
    return null;
  // `cd app && pnpm test` -> judge the command that did the work.
  const lastStep = trimmed.split(/\s*(?:&&|;)\s*/).pop() ?? trimmed;
  return lastStep.trim() || null;
}

export function commandIntent(command: string): CommandIntent | null {
  const normalized = command.trim().toLowerCase();
  const match = INTENTS.find(([, pattern]) => pattern.test(normalized));
  return match ? match[0] : null;
}

/** A failure that says "wrong tool / wrong setup", not "broken code". */
export function isToolingFailure(observation: RunObservation): boolean {
  if (observation.exitCode === null || observation.exitCode === 0) return false;
  if (observation.exitCode === -1) return false; // still running
  if (observation.exitCode === 126 || observation.exitCode === 127) return true;
  return TOOLING_FAILURE.test(observation.output ?? "");
}

function family(command: string): string {
  return command.trim().split(/\s+/).slice(0, 3).join(" ").toLowerCase();
}

function recoveryLearning(
  failed: string,
  fixed: string,
  intent: CommandIntent,
  success: RunObservation,
  context: RunContext,
): BrainLearning {
  const statement = `\`${failed}\` fails in this workspace; use \`${fixed}\` to ${intent}.`;
  const subject = `recovery:${intent}`;
  const candidate: MemoryCandidate = {
    workspaceId: context.workspaceId,
    kind: "failure",
    subject,
    statement,
    tags: ["neo-brain", "failure", intent],
    confidence: 0.85,
    provenance: {
      // Two exit codes are the evidence; nothing here is an opinion.
      source: "verified-agent-result",
      sourceId: "neo-brain:recovery",
      conversationId: context.conversationId,
      eventId: success.eventId,
      repositoryId: context.repositoryId,
      observedAt: success.observedAt ?? new Date().toISOString(),
    },
  };
  const key = learningKey("failure", subject, statement);
  return {
    id: key,
    key,
    layer: "failure",
    candidate,
    needsReview: false,
    evidence: `${failed} -> ${fixed}`,
    createdAt: candidate.provenance.observedAt,
  };
}

/**
 * Stateful scanner: feed observations in order, get recoveries out. One
 * instance per conversation, so a failure in one chat is never "fixed" by a
 * command in another.
 */
export class RecoveryTracker {
  private lastToolingFailure = new Map<CommandIntent, string>();

  constructor(private readonly context: RunContext) {}

  observe(observation: RunObservation): BrainLearning | null {
    const command = cleanCommand(observation.command);
    if (!command) return null;
    const intent = commandIntent(command);
    if (!intent) return null;

    if (isToolingFailure(observation)) {
      this.lastToolingFailure.set(intent, command);
      return null;
    }
    if (observation.exitCode !== 0) return null;

    const failed = this.lastToolingFailure.get(intent);
    if (!failed) return null;
    this.lastToolingFailure.delete(intent);
    if (family(failed) === family(command)) return null;
    return recoveryLearning(failed, command, intent, observation, this.context);
  }
}

export function detectRecoveries(
  observations: readonly RunObservation[],
  context: RunContext,
): BrainLearning[] {
  const tracker = new RecoveryTracker(context);
  return observations
    .map((observation) => tracker.observe(observation))
    .filter((learning): learning is BrainLearning => learning !== null);
}
