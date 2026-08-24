/**
 * Server-side port of `src/lib/workspace-memory/workspace-id.ts`'s
 * `computeWorkspaceId`. Kept as a literal, verified-identical port (see
 * `__tests__/scripts/agentops-workspace-id.test.ts`, which cross-checks
 * against golden values produced by the TypeScript original) rather than an
 * import, because that module lives in `src/` (bundled for the browser) and
 * this collector is a standalone Node script the app's bundler never touches.
 *
 * Why this exists: `scripts/agentops/supabase-store.mjs` writes
 * `agentops_runs.workspace_id`, which FKs to `workspaces.id`. The rest of the
 * platform (`src/lib/data-platform/repositories/workspace-repository.ts`)
 * requires that id to always be this hash — "never a fresh uuid" — never a
 * raw path. Using anything else here would make AgentOps rows invisible to
 * every other workspace-scoped query and RLS policy in the schema.
 *
 * DO NOT let this drift from the original: the hash algorithm and the two
 * pieces of input (backend id, workspace path) must match exactly, or the
 * same real workspace resolves to two different ids depending on whether the
 * browser or the collector computed it.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Windows paths are case-insensitive; POSIX paths are not. */
function isWindowsPath(path) {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function normalizeWorkspacePath(path) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const slashed = trimmed.replace(/\\/g, "/");
  return isWindowsPath(path) ? slashed.toLowerCase() : slashed;
}

function fnv1a(input) {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Returns null when either half is missing — callers must then skip rather
 * than fall back to a shared bucket, same contract as the TS original.
 */
export function computeWorkspaceId(backendId, workspacePath) {
  const backend = backendId?.trim();
  const path = workspacePath ? normalizeWorkspacePath(workspacePath) : "";
  if (!backend || !path) return null;
  // Two hashes over the same NUL-joined key halve the collision surface of a
  // single 32-bit hash without pulling in a crypto dependency. Must match
  // the TS original's separator exactly (NUL, not a space) or ids diverge.
  const key = `${backend}\u0000${path}`;
  return `ws_${fnv1a(key)}${fnv1a(`${key}\u0000salt`)}`;
}

/**
 * The collector talks to exactly one agent-server per process
 * (`AGENT_SERVER_URL`), matching the frontend's seeded default local backend
 * connection (`SEEDED_DEFAULT_BACKEND_ID` in
 * `src/api/backend-registry/default-backend.ts`) in the common case where the
 * user hasn't added an alternate named local backend. There is no way for
 * this server-side process to know which backend-registry entry a browser
 * has selected, so this fixed id is a pragmatic default, not a guarantee — a
 * custom-named alternate local backend will still produce a workspace-id
 * mismatch. Same class of limitation this feature already accepts elsewhere
 * (see AGENTS.md, "AgentOps Control Tower").
 */
export const DEFAULT_BACKEND_ID = "default-local";
