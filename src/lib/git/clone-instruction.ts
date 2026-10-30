/**
 * The instruction the app appends to the first message of a GitHub repo
 * conversation so the agent clones (or updates) the checkout. The agent
 * needs it; the user never typed it, so the transcript hides it.
 */
export const CLONE_INSTRUCTION_PREFIX = "Before doing anything else, run: ";

/** The instruction runs from its prefix to the closing `fi`. */
const CLONE_INSTRUCTION_PATTERN =
  /\s*Before doing anything else, run: if \[ -d \.git \];[\s\S]*?; fi/g;

export function stripCloneInstruction(text: string): string {
  return text.includes(CLONE_INSTRUCTION_PREFIX)
    ? text.replace(CLONE_INSTRUCTION_PATTERN, "").trimEnd()
    : text;
}
