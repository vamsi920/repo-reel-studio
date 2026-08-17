// Agent narration — turns the structured status/event data the agent already
// produces into first-person sentences, so surfaces that today only show
// dashboards/badges/raw logs can also "say" what's happening, in the same
// voice as the existing chat surfaces (OnboardingChat, RepoInvestigator's
// "NeoDevEx Assistant").
//
// Deliberately template-based, not LLM-generated: narration is derived only
// from real status data, so it can never say something that didn't happen.

import type {
  ProactiveDeepWorkApproach,
  ProactiveDeepWorkJourney,
  ProactiveDeepWorkStage,
} from "@/lib/proactiveAgentOps";
import type { ProactiveTimelineRow } from "@/components/studio/agent-ops/proactive/proactiveEventTimeline";
import type { SmeReview } from "@/lib/smeAgent";

export const NARRATOR_PERSONA = {
  name: "NeoDevEx Assistant",
};

export const THINKING_LINES = [
  "Still working on it…",
  "Checking the details…",
  "Piecing this together…",
  "Almost there…",
];

// ---------------------------------------------------------------------------
// Proactive deep-work journey
// ---------------------------------------------------------------------------

const STAGE_VERBS: Record<string, string> = {
  research: "researching the issue",
  brainstorm: "brainstorming possible fixes",
  patch: "writing a patch",
  test: "running the tests",
  verify: "verifying the result",
};

export function narrateProactiveStage(stage: ProactiveDeepWorkStage): string {
  const verb = STAGE_VERBS[stage.key] ?? `working on ${stage.label.toLowerCase()}`;
  switch (stage.status) {
    case "done":
      return stage.detail ? `Finished ${verb} — ${stage.detail}` : `Finished ${verb}.`;
    case "failed":
      return stage.detail ? `Hit a problem while ${verb}: ${stage.detail}` : `Hit a problem while ${verb}.`;
    case "skipped":
      return `Skipped ${stage.label.toLowerCase()} for this run.`;
    case "pending":
    default:
      return `Haven't started ${stage.label.toLowerCase()} yet.`;
  }
}

export function narrateProactiveVerdict(journey: ProactiveDeepWorkJourney): string {
  if (journey.prReady) {
    return "I'm confident in this fix — every check passed, so I'm ready to open a pull request.";
  }
  if (journey.attemptsRun > 0) {
    const tries = journey.attemptsRun === 1 ? "one approach" : `${journey.attemptsRun} approaches`;
    return `I tried ${tries} but couldn't get a fully green build yet, so I haven't opened a PR.`;
  }
  return "I'm still working through this — no verdict yet.";
}

export function narrateProactiveApproach(approach: ProactiveDeepWorkApproach, isWinner: boolean): string {
  const risk = approach.risk ? ` (${approach.risk} risk)` : "";
  if (isWinner) {
    return `I went with "${approach.title}"${risk} — ${approach.rationale || "it looked like the safest bet."}`;
  }
  return `I considered "${approach.title}"${risk} but didn't pick it. ${approach.rationale || ""}`.trim();
}

// ---------------------------------------------------------------------------
// Agent-run event kinds (shared by the Live Console and Mission Map, since
// linked-run timeline rows and Mission Map events use the same `kind` taxonomy)
// ---------------------------------------------------------------------------

type StageBucket = "prepare" | "reproduce" | "diagnose" | "patch" | "validate" | "pr";

const STAGE_BUCKET_KINDS: Record<StageBucket, string[]> = {
  prepare: ["queued", "preparing", "workspace", "prepare.start", "prepare.cache", "prepare.done", "prepare.env_build"],
  reproduce: ["repro.start", "repro.install", "repro.test", "repro.done"],
  diagnose: ["diagnose.start", "diagnose.done", "diagnose.hypothesis", "issue", "plan", "running"],
  patch: ["patch", "patch.start", "patch.done", "patch.failed", "execute.command", "execute.edit", "execute.think", "critique"],
  validate: ["validating", "validate.start", "validate.done", "policy", "policy_warning"],
  pr: ["review", "pr.start", "pr.commit", "pr.done", "pr.manual", "approved", "rejected"],
};

const STAGE_BUCKET_FALLBACK: Record<StageBucket, string> = {
  prepare: "I'm setting up the workspace",
  reproduce: "I'm reproducing the issue",
  diagnose: "I'm digging into the root cause",
  patch: "I'm writing and applying a patch",
  validate: "I'm validating the fix",
  pr: "I'm preparing the pull request",
};

function classifyEventKind(kind: string): StageBucket {
  for (const bucket of Object.keys(STAGE_BUCKET_KINDS) as StageBucket[]) {
    if (STAGE_BUCKET_KINDS[bucket].includes(kind)) return bucket;
  }
  if (kind.startsWith("prepare")) return "prepare";
  if (kind.startsWith("repro")) return "reproduce";
  if (kind.startsWith("diagnose")) return "diagnose";
  if (kind.startsWith("patch") || kind.startsWith("execute")) return "patch";
  if (kind.startsWith("validate")) return "validate";
  if (kind.startsWith("pr") || kind.startsWith("review")) return "pr";
  return "prepare";
}

const EVENT_KIND_SENTENCES: Record<string, string> = {
  queued: "I'm queued up and about to start.",
  preparing: "I'm preparing the workspace.",
  workspace: "I've set up the workspace.",
  "prepare.start": "I'm setting up a sandbox to work in.",
  "prepare.cache": "I'm reusing a cached environment to save time.",
  "prepare.done": "The workspace is ready.",
  "prepare.env_build": "I'm building the environment image for this project's stack.",
  "repro.start": "I'm trying to reproduce the issue.",
  "repro.install": "I'm installing dependencies so I can reproduce the issue.",
  "repro.test": "I'm running the test that reproduces the bug.",
  "repro.done": "I've reproduced the issue.",
  "diagnose.start": "I'm digging into why this is happening.",
  "diagnose.done": "I've worked out the root cause.",
  "diagnose.hypothesis": "I have a hypothesis about the root cause.",
  issue: "I'm looking at the issue.",
  plan: "I've put together a plan.",
  running: "I'm working through the plan.",
  patch: "I'm making a code change.",
  "patch.start": "I'm starting to write a patch.",
  "patch.done": "I've finished writing the patch.",
  "patch.failed": "That patch attempt didn't work — I'll try a different approach.",
  "execute.command": "I'm running a command.",
  "execute.edit": "I'm editing a file.",
  "execute.think": "I'm thinking through the next step.",
  critique: "I'm reviewing my own work for issues.",
  validating: "I'm validating the change.",
  "validate.start": "I'm starting validation.",
  "validate.done": "Validation is done.",
  policy: "I checked this against policy.",
  policy_warning: "A policy check flagged something worth a second look.",
  review: "I'm reviewing the change before opening a PR.",
  "pr.start": "I'm starting to draft a pull request.",
  "pr.commit": "I've committed the change.",
  "pr.done": "The pull request is ready.",
  "pr.manual": "This one needs a manual PR — I can't open it automatically.",
  approved: "This was approved.",
  rejected: "This was rejected.",
};

export function narrateEventKind(kind: string, opts: { title?: string; level?: string | null } = {}): string {
  const sentence = EVENT_KIND_SENTENCES[kind];
  if (sentence) {
    return opts.level === "error" && opts.title ? `${sentence} Ran into a problem: ${opts.title}.` : sentence;
  }
  const bucket = classifyEventKind(kind);
  return opts.title ? `${STAGE_BUCKET_FALLBACK[bucket]} — ${opts.title}` : `${STAGE_BUCKET_FALLBACK[bucket]}.`;
}

export function narrateMissionMapEvent(event: { kind: string; title: string; level?: string | null }): string {
  return narrateEventKind(event.kind, { title: event.title, level: event.level });
}

// ---------------------------------------------------------------------------
// Proactive live console (batch / candidate / run timeline rows)
// ---------------------------------------------------------------------------

export function narrateLiveEvent(row: ProactiveTimelineRow): string {
  if (row.kind === "validation") {
    const passed = row.level !== "error";
    return passed ? `I ran \`${row.title}\` and it passed.` : `I ran \`${row.title}\` and it failed.`;
  }

  if (row.source === "run") {
    return narrateEventKind(row.stage, { title: row.title, level: row.level });
  }

  if (row.source === "batch") {
    const label = row.stage.replace(/_/g, " ");
    if (row.level === "error") return `The batch hit a problem: ${row.detail || row.title}.`;
    return `The batch is now ${label}.`;
  }

  // candidate source — no fixed kind taxonomy, fall back to the raw title/detail
  // so nothing is ever silently dropped from the plain-English view.
  if (row.level === "error") return `Ran into an issue: ${row.title}${row.detail ? ` — ${row.detail}` : ""}`;
  return row.detail ? `${row.title} — ${row.detail}` : row.title;
}

// ---------------------------------------------------------------------------
// SME fact-checking
// ---------------------------------------------------------------------------

const SME_STATUS_NARRATORS: Record<SmeReview["status"], (review: SmeReview) => string> = {
  verified: (review) => `I checked "${review.label}" against the knowledge base and it holds up — nothing to flag.`,
  flagged: (review) => {
    const top = review.findings[0];
    return top
      ? `I checked "${review.label}" and found something that conflicts with what we know: ${top.issue}`
      : `I checked "${review.label}" and found something that conflicts with the knowledge base.`;
  },
  attention: (review) => {
    const top = review.findings[0];
    return top
      ? `I checked "${review.label}" — mostly fine, but ${top.issue.charAt(0).toLowerCase()}${top.issue.slice(1)}`
      : `I checked "${review.label}" — a couple of details need a second look.`;
  },
  no_material: () =>
    "There's no knowledge base for this project yet, so I couldn't check this against anything.",
  error: (review) => `I wasn't able to complete this check: ${review.summary}`,
};

export function narrateSmeReview(review: SmeReview): string {
  return SME_STATUS_NARRATORS[review.status]?.(review) ?? review.summary;
}
