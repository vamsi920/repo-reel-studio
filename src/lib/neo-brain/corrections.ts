/**
 * Turns what a user tells the agent into brain learnings.
 *
 * Deterministic on purpose: it runs on every user message, in the background,
 * at zero model cost, and its mistakes must be predictable. It only recognises
 * sentences that read as a standing instruction or a correction; everything
 * else (questions, one-off requests, pasted logs) yields nothing.
 *
 * Routing (the "correction routing table"):
 * - "never push / deploy / delete ... (without asking)" -> gate
 * - "use X instead of Y", "we use X, not Y"           -> convention
 * - "we decided ...", "we're going with ..."           -> decision
 * - "to test, run `cmd`"                               -> skill
 * - "always ...", "never ...", "from now on ..."       -> policy
 * - "no, X is Y", "actually, X ..."                    -> fact, held for review
 *
 * The user's own standing instructions are stored directly (source
 * `user-decision`). A correction of the agent is Neo's reading of a
 * disagreement, so it waits for a person to approve it.
 */
import { scanForSecrets } from "#/lib/environment/discovery-guard";
import {
  KT_DOCS_BLOCK_END,
  KT_DOCS_BLOCK_START,
} from "#/lib/knowledge/kt-format";
import {
  MEMORY_BLOCK_END,
  MEMORY_BLOCK_START,
} from "#/lib/workspace-memory/markers";
import type { MemoryCandidate } from "#/lib/workspace-memory/types";

import { learningKey, subjectSlug } from "./learning-key";
import { LAYER_TO_KIND, type BrainLayer, type BrainLearning } from "./types";

export interface LearnContext {
  workspaceId: string;
  conversationId: string | null;
  repositoryId?: string;
  eventId?: string;
  observedAt?: string;
}

/** Longer messages are pasted logs or specs, not instructions. */
export const MAX_MESSAGE_CHARS = 4000;
const MAX_SENTENCE_CHARS = 280;
const MIN_SENTENCE_CHARS = 10;

/** Studio receipts (`[neotest result] {...}`) are plumbing, not the user. */
const RECEIPT_PREFIX = /^\s*\[[a-z -]+ result\]/i;

const LEAD_WORDS =
  /^(?:(?:ok(?:ay)?|also|and|but|so|btw|fyi|note|remember|important|please|hey|hi)[,:!-]?\s+)+/i;

const DURABLE_PREFIX =
  /^(?:from now on|going forward|for this (?:repo|repository|project|codebase)|in this (?:repo|repository|project|codebase)|for future (?:tasks|reference)|as a rule)[,:]?\s+/i;

const DANGEROUS_ACTION =
  /\b(?:force[- ]push|push|deploy|delete|drop|merge|release|publish|rm -rf|reset --hard|rebase|truncate|migrate (?:prod|production))\b/i;

const NOT_A_RULE =
  /^(?:no (?:worries|problem|thanks|thank you|need)|nope,? (?:that's|thats) fine)/i;

const HEDGED = /^(?:i think|i guess|maybe|perhaps|probably|not sure)\b/i;

/** Memory and KT blocks Neo itself prepended; never learn from those. */
function stripInjected(text: string): string {
  let out = text;
  [
    [MEMORY_BLOCK_START, MEMORY_BLOCK_END],
    [KT_DOCS_BLOCK_START, KT_DOCS_BLOCK_END],
  ].forEach(([start, end]) => {
    let from = out.indexOf(start);
    while (from !== -1) {
      const to = out.indexOf(end, from);
      out =
        to === -1
          ? out.slice(0, from)
          : out.slice(0, from) + out.slice(to + end.length);
      from = out.indexOf(start);
    }
  });
  return out;
}

interface Classified {
  layer: BrainLayer;
  subject: string;
  statement: string;
  needsReview: boolean;
}

function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (!trimmed) return trimmed;
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!]$/.test(capital) ? capital.replace(/!$/, ".") : `${capital}.`;
}

function stripEnd(text: string): string {
  return text
    .trim()
    .replace(/[.!]+$/, "")
    .trim();
}

/** Splits a message into candidate sentences; code blocks are dropped. */
export function splitSentences(text: string): string[] {
  const withoutCode = text.replace(/```[\s\S]*?```/g, "\n");
  return withoutCode
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!])\s+(?=[A-Z`"])/))
    .map((part) => part.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);
}

function classifyConvention(sentence: string): Classified | null {
  const match = sentence.match(
    /^(?:we\s+(?:use|prefer)|use|prefer|always use)\s+(.+?)(?:,\s*|\s+)(?:not|instead of|rather than|over)\s+(.+?)[.!]?$/i,
  );
  if (!match) return null;
  const preferred = stripEnd(match[1]);
  const avoided = stripEnd(match[2]);
  if (!preferred || !avoided) return null;
  if (preferred.length > 60 || avoided.length > 60) return null;
  // Sorted, so "use npm instead of pnpm" later supersedes the same subject.
  const pair = [subjectSlug(preferred, 3), subjectSlug(avoided, 3)].sort();
  return {
    layer: "convention",
    subject: `prefer:${pair.join("~")}`,
    statement: sentenceCase(`Use ${preferred} instead of ${avoided}`),
    needsReview: false,
  };
}

function classifyGate(sentence: string, durable: boolean): Classified | null {
  if (!DANGEROUS_ACTION.test(sentence)) return null;
  const startsNever = /^never\b/i.test(sentence);
  const startsDont = /^(?:don't|do not|dont)\s+(?:ever\s+)?/i.test(sentence);
  const asksFirst =
    /^always\s+(?:ask|check with me|get (?:my )?approval|confirm)\b/i.test(
      sentence,
    );
  const standing = durable || /\bever\b|\bwithout\b|\bunless\b/i.test(sentence);
  if (!(startsNever || asksFirst || (startsDont && standing))) return null;
  const normalized = sentence.replace(
    /^(?:don't|do not|dont)\s+(?:ever\s+)?/i,
    "Never ",
  );
  return {
    layer: "gate",
    subject: `gate:${subjectSlug(normalized, 5)}`,
    statement: sentenceCase(normalized),
    needsReview: false,
  };
}

function classifyDecision(sentence: string): Classified | null {
  const match = sentence.match(
    /^(?:we(?:'ve| have)?\s+decided(?:\s+(?:to|that|on))?|decision:|we(?:'re| are)\s+going with|let's standardi[sz]e on|we standardi[sz]ed on)\s+(.+)/i,
  );
  if (!match || stripEnd(match[1]).length < 4) return null;
  return {
    layer: "decision",
    subject: `decision:${subjectSlug(match[1])}`,
    statement: sentenceCase(sentence),
    needsReview: false,
  };
}

function classifySkill(sentence: string): Classified | null {
  const howTo = sentence.match(
    /\bto\s+(run|test|build|lint|start|deploy|seed|migrate|typecheck|format)\b[^`]*?\b(?:run|use)\s+`([^`]+)`/i,
  );
  const runsWith = sentence.match(
    /\b(tests?|build|lint|typecheck|dev server)\s+(?:runs?|is run|are run)\s+(?:with|via|using)\s+`([^`]+)`/i,
  );
  const match = howTo ?? runsWith;
  if (!match) return null;
  const intent = match[1].toLowerCase().replace(/s$/, "").replace(/\s+/g, "-");
  const command = match[2].trim();
  if (!command || command.length > 200) return null;
  return {
    layer: "skill",
    subject: `skill:${intent}`,
    statement: sentenceCase(
      `To ${intent.replace(/-/g, " ")}, run \`${command}\``,
    ),
    needsReview: false,
  };
}

function classifyPolicy(sentence: string, durable: boolean): Classified | null {
  const marked =
    /^(?:always|never|(?:make sure|be sure|remember) to (?:always\s+)?|(?:don't|do not) ever)\s*\w+/i.test(
      sentence,
    );
  const imperative =
    durable &&
    !/^(?:i|we|it|this|that|there|you)\b/i.test(sentence) &&
    sentence.split(/\s+/).length >= 3;
  if (!marked && !imperative) return null;
  return {
    layer: "policy",
    subject: `policy:${subjectSlug(sentence, 5)}`,
    statement: sentenceCase(sentence),
    needsReview: false,
  };
}

/** One standing-instruction sentence (no leading "no,"/"actually"). */
function classifyInstruction(
  sentence: string,
  durable: boolean,
): Classified | null {
  return (
    classifyGate(sentence, durable) ??
    classifyConvention(sentence) ??
    classifyDecision(sentence) ??
    classifySkill(sentence) ??
    classifyPolicy(sentence, durable)
  );
}

function classifyCorrection(sentence: string): Classified | null {
  const match = sentence.match(
    /^(?:no|nope|wrong|incorrect|not quite|actually|that's (?:wrong|not right|incorrect|not true)|that is (?:wrong|not right|incorrect))\b[,.!:;\s-]*(.+)$/i,
  );
  if (!match) return null;
  const rest = match[1].trim();
  if (rest.length < 12) return null;
  // "No, always use pnpm" is still the user's own instruction.
  const instruction = classifyInstruction(rest, false);
  if (instruction) return instruction;
  if (
    !/\b(?:is|are|was|were|lives|live|uses|use|goes|should|must|runs|belongs|means|comes|points|needs)\b/i.test(
      rest,
    )
  ) {
    return null;
  }
  return {
    layer: "fact",
    subject: `fact:${subjectSlug(rest)}`,
    statement: sentenceCase(rest),
    needsReview: true,
  };
}

export function classifySentence(raw: string): Classified | null {
  let sentence = raw.replace(LEAD_WORDS, "").trim();
  if (sentence.length < MIN_SENTENCE_CHARS) return null;
  if (sentence.length > MAX_SENTENCE_CHARS) return null;
  if (sentence.includes("?")) return null;
  if (NOT_A_RULE.test(sentence) || HEDGED.test(sentence)) return null;
  if (!scanForSecrets(sentence).ok) return null;

  const durable = DURABLE_PREFIX.test(sentence);
  if (durable) sentence = sentence.replace(DURABLE_PREFIX, "").trim();
  if (sentence.length < MIN_SENTENCE_CHARS) return null;

  return classifyCorrection(sentence) ?? classifyInstruction(sentence, durable);
}

function toLearning(
  classified: Classified,
  sentence: string,
  context: LearnContext,
): BrainLearning {
  const kind = LAYER_TO_KIND[classified.layer];
  const observedAt = context.observedAt ?? new Date().toISOString();
  const candidate: MemoryCandidate = {
    workspaceId: context.workspaceId,
    kind,
    subject: classified.subject,
    statement: classified.statement,
    tags: ["neo-brain", classified.layer],
    confidence: classified.needsReview ? 0.7 : 0.9,
    // A gate must reach the agent whatever the task is about.
    pinned: classified.layer === "gate",
    provenance: {
      source: "user-decision",
      sourceId: "neo-brain:user-message",
      conversationId: context.conversationId,
      eventId: context.eventId,
      repositoryId: context.repositoryId,
      observedAt,
    },
  };
  const key = learningKey(kind, classified.subject, classified.statement);
  return {
    id: key,
    key,
    layer: classified.layer,
    candidate,
    needsReview: classified.needsReview,
    evidence: sentence.trim(),
    createdAt: observedAt,
  };
}

/** Every learning one user message carries, deduplicated. */
export function extractLearnings(
  message: string,
  context: LearnContext,
): BrainLearning[] {
  if (!context.workspaceId) return [];
  const text = stripInjected(message ?? "");
  if (!text.trim() || text.length > MAX_MESSAGE_CHARS) return [];
  if (RECEIPT_PREFIX.test(text)) return [];

  const seen = new Set<string>();
  const learnings: BrainLearning[] = [];
  splitSentences(text).forEach((sentence) => {
    const classified = classifySentence(sentence);
    if (!classified) return;
    const learning = toLearning(classified, sentence, context);
    if (seen.has(learning.key)) return;
    seen.add(learning.key);
    learnings.push(learning);
  });
  return learnings;
}
