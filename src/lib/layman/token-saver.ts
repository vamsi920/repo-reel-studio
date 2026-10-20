/**
 * Layman token saver: where the app applies Layman to what it sends the model
 * on every call.
 *
 * Measured in case-studies/tokens: on a fresh install the Layman compression
 * the app already shipped (workspace-memory context) saved 0 tokens per task,
 * because that context starts empty, while every model call carried a fixed
 * prefix of about 15k tokens. The biggest part the app controls is the skills
 * index (the name and description of every bundled skill, listed on every
 * call). This module shortens it.
 *
 * Output side: a Layman "caveman" directive (terse narration between tool
 * calls, complete final answers) cost task success on Gemini 2.5 Flash
 * (case-studies/tokens, rounds 1-2), so it is only sent to frontier-tier
 * models. On Gemini 4 Argon (case-studies/chat) it cut tokens per task 18%
 * with equal or better accuracy; with medium thinking, 37%.
 *
 * Pure and deterministic: no model calls, no network.
 */
import { compressForPrompt } from "./compression-core";

/**
 * Layman output style for frontier models. Compresses what the agent writes
 * between tool calls; never code, tests, commands or the final answer's facts.
 */
export const LAYMAN_OUTPUT_STYLE = [
  "<OUTPUT_STYLE>",
  "Terse (Layman caveman). Applies to your messages and thoughts between tool calls: no preamble, no plan narration, no restating tool output; fragments fine; drop articles, filler and pleasantries. Think only as much as the next step needs.",
  "Never compress: code, test files, commands, paths, error text, numbers, or the facts in your final answer. Final answer: complete and exact, every requested point with path:line, no padding.",
  "</OUTPUT_STYLE>",
].join("\n");

/** Longest skill description kept in the index, in characters. */
export const SKILL_INDEX_DESCRIPTION_MAX = 140;

const USE_WHEN = /^(use (this )?(skill )?(when|for|to)|trigger(s|ed)?\b)/i;
const SENTENCE_END = /(?<=[.!?])\s+(?=[A-Z`"(])/;
const PARENTHETICAL_EXAMPLE =
  /\s*\((?:e\.g\.|eg\.|for example|such as|like)[^()]*\)/gi;

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * A skill's description for the index, in Layman ultra style: what it does
 * and when to use it, without examples, filler or repetition. The skill's
 * full content is untouched and still loads when the skill is invoked.
 */
export function compactSkillDescription(description: string): string {
  const normalized = description.replace(/\s+/g, " ").trim();
  if (normalized.length <= SKILL_INDEX_DESCRIPTION_MAX) return normalized;
  const sentences = normalized
    .replace(PARENTHETICAL_EXAMPLE, "")
    .split(SENTENCE_END)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const what = sentences[0] ?? normalized;
  const when = sentences.slice(1).find((sentence) => USE_WHEN.test(sentence));
  const kept = [what, when].filter(Boolean).join(" ");
  // The protected pass keeps paths, code and commands byte-for-byte
  // (the bare prose pass turned "AGENTS.md" into "AGENTS. md").
  const compressed = compressForPrompt(kept, {
    mode: "ultra",
    path: "skill-index.md",
    minSavedTokens: 0,
  }).text;
  return cap(
    compressed.replace(/\s+/g, " ").trim(),
    SKILL_INDEX_DESCRIPTION_MAX,
  );
}
