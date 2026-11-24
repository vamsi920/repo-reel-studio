/**
 * Reads the two signals the brain learns from out of raw conversation
 * events, without importing the whole event union: what the user typed, and
 * what a shell command returned.
 */
import type { RunObservation } from "./run-learnings";

interface TextPart {
  type?: string;
  text?: string;
}

interface EventLike {
  id?: string | number;
  timestamp?: string;
  source?: string;
  llm_message?: { role?: string; content?: TextPart[] | string };
  observation?: {
    kind?: string;
    command?: string | null;
    exit_code?: number | null;
    content?: TextPart[];
  };
}

const RUN_KINDS = new Set(["ExecuteBashObservation", "TerminalObservation"]);
const OUTPUT_TAIL_CHARS = 2000;

/** The user's own words, or null for anything else (agent, receipts). */
export function userMessageText(event: unknown): string | null {
  const candidate = event as EventLike;
  if (candidate?.source !== "user") return null;
  if (candidate.llm_message?.role !== "user") return null;
  const { content } = candidate.llm_message;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return text.trim() ? text : null;
}

export function runObservation(event: unknown): RunObservation | null {
  const candidate = event as EventLike;
  const observation = candidate?.observation;
  if (!observation?.kind || !RUN_KINDS.has(observation.kind)) return null;
  const output = (observation.content ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  return {
    command: observation.command ?? null,
    exitCode: observation.exit_code ?? null,
    output: output.slice(-OUTPUT_TAIL_CHARS),
    eventId: candidate.id !== undefined ? String(candidate.id) : undefined,
    observedAt: candidate.timestamp,
  };
}

export function eventTimestamp(event: unknown): string {
  return (event as EventLike)?.timestamp ?? "";
}

export function eventId(event: unknown): string | undefined {
  const { id } = event as EventLike;
  return id !== undefined ? String(id) : undefined;
}
