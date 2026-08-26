/**
 * Prompt builder for Proactivation automations.
 *
 * Proactivation has no dedicated backend model or endpoint — it creates
 * ordinary `Automation` records (see `src/types/automation.ts`) whose
 * `prompt` field carries both a machine-readable config marker (parsed back
 * out by the feature card / detail banner) and the natural-language
 * instruction that drives the agent run, the same way PR creation itself is
 * prompt-driven in this app (`getCreatePRPrompt` in `#/utils/utils.ts`).
 */

import {
  branchNamingRule,
  HONESTY_RULE,
  PR_BODY_RULE,
} from "#/manifests/automation-prompt-rules";

export type ProactivationWatchArea =
  | "dependency"
  | "test"
  | "ci"
  | "documentation"
  | "code-quality"
  | "repository-health";

export type ProactivationAutonomyLevel =
  | "recommend"
  | "prepare-fix"
  | "create-pr";

export interface ProactivationConfig {
  version: 1;
  watchAreas: ProactivationWatchArea[];
  autonomyLevel: ProactivationAutonomyLevel;
  repository: string;
}

export interface BuildProactivationPromptInput {
  watchAreas: ProactivationWatchArea[];
  autonomyLevel: ProactivationAutonomyLevel;
  repository: string;
}

/** Every generated automation name starts with this so the feature card can find them. */
export const PROACTIVATION_NAME_PREFIX = "Proactive Engineering";

const MARKER_START = "<!-- neodevex:proactivation ";
const MARKER_END = " -->";

const WATCH_AREA_LABELS: Record<ProactivationWatchArea, string> = {
  dependency: "Dependencies",
  test: "Tests",
  ci: "CI",
  documentation: "Documentation",
  "code-quality": "Code Quality",
  "repository-health": "Repository Health",
};

const WATCH_AREA_GUIDANCE: Record<ProactivationWatchArea, string> = {
  dependency:
    "Dependencies: outdated packages with a safe upgrade path, deprecated dependencies, unnecessary or unused dependencies.",
  test: "Tests: failing tests, flaky tests where signals exist, obviously missing coverage around frequently-changed code, broken or outdated tests.",
  ci: "CI: repeated CI failures, unstable pipelines, obvious workflow problems. Only use this if you actually have access to CI history or configuration — skip it otherwise, do not guess.",
  documentation:
    "Documentation: stale docs, code/docs mismatches, important undocumented components.",
  "code-quality":
    "Code Quality: duplicated logic, obvious maintainability problems, dead code candidates, repeated TODO/FIXME clusters, suspicious complexity.",
  "repository-health":
    "Repository Health: outdated configuration, unused scripts, broken development setup, easy cleanup opportunities.",
};

const AUTONOMY_GUIDANCE: Record<ProactivationAutonomyLevel, string> = {
  recommend:
    "Autonomy level: Recommend. Detect the problem, investigate it, and explain the improvement with evidence. Do NOT modify any files in the repository. Stop after presenting the recommendation.",
  "prepare-fix":
    "Autonomy level: Prepare Fix. Detect the problem, investigate it, then create an isolated branch (or worktree) and make the change, running the relevant tests and fixing any failures you introduced. Verify the result. Do NOT push the branch and do NOT open a pull request — a person will review your change and explicitly ask for a PR afterward. Leave the change committed locally on the branch.",
  "create-pr":
    "Autonomy level: Create PR. Detect the problem, investigate it, create an isolated branch, make the change, run tests, and verify the result. Once verified, push the branch and open a pull request following this repository's PR conventions (use a PR template if one exists). You were explicitly authorized by the user to do this end-to-end. Never merge the pull request yourself, and never deploy anything.",
};

/**
 * Encodes the wizard's choices as a JSON preamble at the start of the
 * automation's prompt. `parseProactivationMarker` reads it back out; nothing
 * else in this app inspects it, so the exact JSON shape is free to evolve as
 * long as both sides of this file stay in sync.
 */
function buildMarker(config: ProactivationConfig): string {
  return `${MARKER_START}${JSON.stringify(config)}${MARKER_END}`;
}

export function parseProactivationMarker(
  prompt: string | null | undefined,
): ProactivationConfig | null {
  if (!prompt) return null;
  const start = prompt.indexOf(MARKER_START);
  if (start === -1) return null;
  const end = prompt.indexOf(MARKER_END, start);
  if (end === -1) return null;
  const raw = prompt.slice(start + MARKER_START.length, end);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "version" in parsed &&
      "watchAreas" in parsed &&
      "autonomyLevel" in parsed &&
      "repository" in parsed
    ) {
      return parsed as ProactivationConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export function isProactivationAutomation(
  prompt: string | null | undefined,
): boolean {
  return parseProactivationMarker(prompt) !== null;
}

export function getWatchAreaLabel(area: ProactivationWatchArea): string {
  return WATCH_AREA_LABELS[area];
}

/**
 * Builds the full automation prompt: the machine-readable marker followed by
 * the natural-language run instruction the agent actually reads.
 */
export function buildProactivationPrompt(
  input: BuildProactivationPromptInput,
): string {
  const { watchAreas, autonomyLevel, repository } = input;
  const config: ProactivationConfig = {
    version: 1,
    watchAreas,
    autonomyLevel,
    repository,
  };

  const areaGuidance = watchAreas
    .map((area) => `- ${WATCH_AREA_GUIDANCE[area]}`)
    .join("\n");

  const instruction = `You are running a Proactivation pass for this repository, on behalf of the user who enabled it. Follow this disciplined process:

1. Load workspace and repository context. Understand the current state of the codebase before looking for problems.
2. Check ".neodevex/memory" for any previously-dismissed Proactivation candidates and any previous Proactivation fixes or pull requests. Do not re-propose something that was already dismissed with a reason, and do not duplicate an already-open pull request or branch — check "gh pr list" and existing branches first.
3. Look for improvement candidates only in these areas:
${areaGuidance}
4. Rank the candidates you find and pick the single strongest one. Quality over quantity: a real, well-evidenced improvement beats several weak ones. If you cannot find any real, worthwhile improvement, end the run by clearly stating "No meaningful improvements found" — that is a valid, successful outcome. Never invent a vague suggestion like "improve code quality" just to have something to report; every suggestion must name specific files, functions, or configuration and explain why it matters.
5. Investigate the candidate deeply and verify it is a real issue (not a false positive) before proposing anything.
6. Present the candidate with: what you found, why it matters, the evidence (files/functions/config), the affected area, your suggested change, and the risk level (low/medium/high).

${AUTONOMY_GUIDANCE[autonomyLevel]}

Keep your final summary concise and evidence-based.

${HONESTY_RULE} ${PR_BODY_RULE} ${branchNamingRule("proactivation")}`;

  return `${buildMarker(config)}\n\n${instruction}`;
}
