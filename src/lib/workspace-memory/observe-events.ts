/**
 * Turns conversation events into memory candidates.
 *
 * Deliberately narrow. The only thing this observes today is a command that
 * actually ran and actually succeeded, which is the cheapest genuinely
 * grounded signal in the event stream: exit code 0 is a fact, not an opinion.
 * That alone teaches a workspace its real build, test and lint commands --
 * the thing agents most often rediscover from scratch.
 *
 * Everything richer (architecture facts, business rules) arrives through
 * `submitMemoryCandidate` from the surfaces that already have structure:
 * SME verdicts, approved requirements, PR outcomes, indexed documents.
 */
import type { MemoryCandidate } from "./types";

/**
 * Commands worth remembering: project-level workflows, not the agent poking
 * around. `ls`, `cat` and `cd` succeeding tells nobody anything.
 */
const MEANINGFUL_COMMAND = [
  /^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|lint|typecheck|check|dev|start|e2e)/,
  /^(pytest|tox|mypy|ruff|black|flake8)\b/,
  /^(cargo|go|mvn|gradle|make)\s+(test|build|run|check|fmt|vet)/,
  /^(pre-commit|tsc|vitest|jest|playwright|eslint|prettier)\b/,
];

/** Never remember a command carrying a credential or a one-off path. */
const UNSAFE_COMMAND = [
  /(?:token|secret|password|passwd|api[-_]?key|credential)\s*[=:]/i,
  /\b(?:curl|wget)\b.*\b(?:-H|--header)\b/i,
  /\bexport\s+\w*(?:KEY|TOKEN|SECRET|PASSWORD)\w*=/i,
];

/** Shape we need from a bash observation, without importing the whole union. */
export interface ObservedCommand {
  command: string | null;
  exitCode: number | null;
  eventId?: string;
  observedAt?: string;
}

export interface ObserveContext {
  workspaceId: string;
  conversationId: string | null;
  repositoryId?: string;
  commitSha?: string;
}

export function isMemorableCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized || normalized.length > 200) return false;
  if (UNSAFE_COMMAND.some((pattern) => pattern.test(normalized))) return false;
  return MEANINGFUL_COMMAND.some((pattern) => pattern.test(normalized));
}

/**
 * One command becomes at most one candidate. Subject is keyed on the command
 * family, so re-running `npm test` supersedes rather than accumulating, and a
 * command that later starts failing can supersede the record that said it
 * worked.
 */
export function commandCandidate(
  observed: ObservedCommand,
  context: ObserveContext,
): MemoryCandidate | null {
  const command = observed.command?.trim();
  if (!command || observed.exitCode !== 0) return null;
  if (!isMemorableCommand(command)) return null;

  const family = command.split(/\s+/).slice(0, 3).join(" ").toLowerCase();

  return {
    workspaceId: context.workspaceId,
    kind: "procedure",
    subject: `command:${family}`,
    statement: `\`${command}\` runs successfully in this workspace.`,
    tags: ["command"],
    confidence: 0.9,
    provenance: {
      source: "verified-agent-result",
      sourceId: family,
      conversationId: context.conversationId,
      eventId: observed.eventId,
      repositoryId: context.repositoryId,
      commitSha: context.commitSha,
      observedAt: observed.observedAt ?? new Date().toISOString(),
    },
  };
}
