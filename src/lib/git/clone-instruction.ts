/**
 * The instruction the app appends to the first message of a GitHub repo
 * conversation so the agent clones (or updates) the checkout and commits
 * under the right name. The agent needs it; the user never typed it, so the
 * transcript hides it.
 */
export const CLONE_INSTRUCTION_PREFIX = "Before doing anything else, run: ";

/**
 * Who the agent commits as when Settings > Application has no git
 * identity. The agent-server's own fallback is "openhands
 * <openhands@all-hands.dev>", which showed up on every pull request.
 */
export const DEFAULT_GIT_USER_NAME = "Neo";
export const DEFAULT_GIT_USER_EMAIL = "neo@neodevex.com";
/** The upstream defaults still stored in older settings. */
const UPSTREAM_GIT_NAMES = new Set(["openhands"]);
const UPSTREAM_GIT_EMAILS = new Set(["openhands@all-hands.dev"]);

/** A value safe inside single quotes in a shell command. */
function shellSafe(value: string): string {
  return value
    .replace(/[^\p{L}\p{N} ._@+-]/gu, "")
    .trim()
    .slice(0, 100);
}

export function resolveGitIdentity(settings: {
  git_user_name?: string | null;
  git_user_email?: string | null;
}): { name: string; email: string } {
  const name = shellSafe(settings.git_user_name ?? "");
  const email = shellSafe(settings.git_user_email ?? "");
  return {
    name:
      name && !UPSTREAM_GIT_NAMES.has(name.toLowerCase())
        ? name
        : DEFAULT_GIT_USER_NAME,
    email:
      email && !UPSTREAM_GIT_EMAILS.has(email.toLowerCase())
        ? email
        : DEFAULT_GIT_USER_EMAIL,
  };
}

/** `; git config user.name '...'; git config user.email '...'` */
export function gitIdentityCommands(identity: {
  name: string;
  email: string;
}): string {
  return `; git config user.name '${shellSafe(identity.name)}'; git config user.email '${shellSafe(identity.email)}'`;
}

/** The instruction runs from its prefix to the closing `fi` (and identity). */
const CLONE_INSTRUCTION_PATTERN =
  /\s*Before doing anything else, run: if \[ -d \.git \];[\s\S]*?; fi(?:; git config user\.(?:name|email) '[^']*')*/g;

export function stripCloneInstruction(text: string): string {
  return text.includes(CLONE_INSTRUCTION_PREFIX)
    ? text.replace(CLONE_INSTRUCTION_PATTERN, "").trimEnd()
    : text;
}
