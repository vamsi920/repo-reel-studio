/**
 * A workspace's identity is (agent-server backend, workspace directory).
 * The same path on two backends is two different workspaces, and the same
 * backend with two paths is two different workspaces — memory must not cross
 * either boundary.
 *
 * FNV-1a rather than `crypto.subtle`: this is called on the message send path
 * and must stay synchronous. It is an identity key, never a security boundary.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Windows paths are case-insensitive; POSIX paths are not. */
function isWindowsPath(path: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

export function normalizeWorkspacePath(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return "";
  const slashed = trimmed.replace(/\\/g, "/");
  return isWindowsPath(path) ? slashed.toLowerCase() : slashed;
}

function fnv1a(input: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Returns null when either half is missing — callers must then skip memory
 * entirely rather than fall back to a shared bucket.
 */
export function computeWorkspaceId(
  backendId: string | null | undefined,
  workspacePath: string | null | undefined,
): string | null {
  const backend = backendId?.trim();
  const path = workspacePath ? normalizeWorkspacePath(workspacePath) : "";
  if (!backend || !path) return null;
  // Two hashes over the same NUL-joined key halve the collision surface of a
  // single 32-bit hash without pulling in a crypto dependency.
  const key = `${backend}\u0000${path}`;
  return `ws_${fnv1a(key)}${fnv1a(`${key}\u0000salt`)}`;
}
