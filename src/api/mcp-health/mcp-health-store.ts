import type { McpServerHealth } from "#/types/mcp-health";

type Listener = () => void;

export type McpHealthMap = Record<string, McpServerHealth>;

/**
 * MCP connection-health store, keyed by `getMcpServerHealthKey(server)`.
 * Mirrors the module-store shape of `#/api/backend-registry/health-store`.
 *
 * Most verdicts are deliberately NOT persisted: a health verdict is only as
 * fresh as its probe, so a reload resets servers to "unchecked" instead of
 * resurrecting a possibly-stale "healthy". The one exception is a
 * `credentials` failure: a rejected token does not fix itself, and losing it
 * on reload hid it from the app-wide reconnect banner. Those survive a reload
 * until the server is edited, re-tested, deleted, or the backend changes.
 * Only the display-safe (already redacted) error text is stored.
 */
const PERSIST_KEY = "neodevex-mcp-credential-failures";

function isCredentialFailure(health: McpServerHealth | undefined): boolean {
  return health?.status === "failed" && health.kind === "credentials";
}

function loadPersisted(): McpHealthMap {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as McpHealthMap;
    const out: McpHealthMap = {};
    for (const [key, health] of Object.entries(parsed ?? {})) {
      if (isCredentialFailure(health)) out[key] = health;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(map: McpHealthMap): void {
  try {
    if (typeof localStorage === "undefined") return;
    const failures: McpHealthMap = {};
    for (const [key, health] of Object.entries(map)) {
      if (isCredentialFailure(health)) failures[key] = health;
    }
    if (Object.keys(failures).length === 0) {
      localStorage.removeItem(PERSIST_KEY);
    } else {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(failures));
    }
  } catch {
    // Storage blocked: the verdict still lives for this page load.
  }
}

let healthMap: McpHealthMap = loadPersisted();
const listeners = new Set<Listener>();
let nextCheckId = 1;

function commit(next: McpHealthMap): void {
  healthMap = next;
  persist(next);
  listeners.forEach((listener) => listener());
}

export function getMcpHealthSnapshot(): McpHealthMap {
  return healthMap;
}

export function subscribeMcpHealth(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mark a probe as in flight and return its id for `resolveMcpHealthCheck`. */
export function beginMcpHealthCheck(key: string): number {
  const checkId = nextCheckId;
  nextCheckId += 1;
  commit({ ...healthMap, [key]: { status: "checking", checkId } });
  return checkId;
}

/**
 * Commit a probe result, but only while the entry is still the `checking`
 * state that probe created. A slow older probe can never overwrite a newer
 * probe's result, and a probe whose server was edited, deleted, or reseeded
 * mid-flight (entry cleared or replaced) is silently dropped — a stale
 * check can never land a false verdict.
 */
export function resolveMcpHealthCheck(
  key: string,
  checkId: number,
  health: McpServerHealth,
): void {
  const current = healthMap[key];
  if (current?.status !== "checking" || current.checkId !== checkId) {
    return;
  }
  commit({ ...healthMap, [key]: health });
}

/** Unconditional write — used to seed health from a pre-save test result. */
export function setMcpServerHealth(key: string, health: McpServerHealth): void {
  commit({ ...healthMap, [key]: health });
}

/** Drop the entry (back to "unchecked") — used when a server changes or is deleted. */
export function clearMcpServerHealth(key: string): void {
  if (!(key in healthMap)) return;
  const { [key]: _removed, ...rest } = healthMap;
  commit(rest);
}

/**
 * Drop every entry — used when the active backend changes. `healthMap` is
 * keyed only by a server's structural fields (type/name/command/url/auth
 * strategy, see `getMcpServerHealthKey`), with no backend identity in the
 * key, so two different backends that happen to configure a same-named
 * server (a common catalog entry) would otherwise show the previous
 * backend's stale health verdict for the new one. Mirrors
 * `useKnowledgeStore.reset()`'s same-shaped fix in
 * `active-backend-context.tsx`.
 */
export function resetMcpHealthStore(): void {
  if (Object.keys(healthMap).length === 0) return;
  commit({});
}

/** Test-only: reset state and listeners. */
export function __resetMcpHealthStoreForTests(): void {
  healthMap = {};
  persist({});
  listeners.clear();
  nextCheckId = 1;
}
