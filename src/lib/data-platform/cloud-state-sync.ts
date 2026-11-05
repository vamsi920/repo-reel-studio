import { supabase } from "#/lib/data-platform/client";

/**
 * Keeps selected localStorage entries in `user_app_state`, so studio
 * projects, conversation metadata and the like follow the signed-in user
 * across browsers, localhost and production instead of living in one browser.
 *
 * localStorage stays the working copy (every store reads it synchronously).
 * A loop notices changed entries and upserts them; on sign-in and on start
 * the cloud copies are merged in. Records keyed by id (projects,
 * conversations) merge per entry, newer `updatedAt` wins, and an entry
 * deleted on one side is not brought back by the other.
 */
export const CLOUD_SYNCED_KEYS = [
  "openhands-test-studio",
  "openhands-synth-studio",
  "openhands-modernization-studio",
  "openhands-onboarding-studio",
  "openhands-agent-server-conversation-metadata",
  "pinned-conversations",
  "archived-conversations",
  "home-store",
  "openhands-kt-tutorial-scripts",
] as const;

const TABLE = "user_app_state";
const BASE_PREFIX = "neodevex-cloud-sync-base:";
const PUSH_INTERVAL_MS = 4000;
/** Rows above this are not pushed (a runaway store must not hit the DB). */
const MAX_VALUE_BYTES = 2_000_000;

type Json = Record<string, unknown>;

/** Ids present at the last sync, per record field (`""` = top level). */
type SyncBase = Record<string, string[]>;

const rehydrators = new Map<string, () => void>();

/** Stores call this so a merged cloud copy reaches their in-memory state. */
export function registerCloudSyncedStore(key: string, rehydrate: () => void) {
  rehydrators.set(key, rehydrate);
}

function isPlainObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A record whose every value is an object, e.g. `{ [projectId]: project }`. */
function isRecordOfObjects(value: unknown): value is Record<string, Json> {
  return (
    isPlainObject(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(isPlainObject)
  );
}

function stamp(entry: Json): string {
  const at = entry.updatedAt ?? entry.updated_at ?? entry.lastUpdated;
  return typeof at === "string" ? at : "";
}

function mergeRecords(
  local: Record<string, Json>,
  remote: Record<string, Json>,
  baseIds: string[] | undefined,
  preferRemote: boolean,
): Record<string, Json> {
  const base = new Set(baseIds ?? []);
  const result: Record<string, Json> = {};
  for (const id of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const l = local[id];
    const r = remote[id];
    if (l && r) {
      const ls = stamp(l);
      const rs = stamp(r);
      if (ls || rs) result[id] = rs > ls ? r : l;
      else result[id] = preferRemote ? r : l;
    } else if (l) {
      // Only here: new locally, or deleted remotely after the last sync.
      if (!base.has(id)) result[id] = l;
    } else if (r) {
      if (!base.has(id)) result[id] = r;
    }
  }
  return result;
}

function mergeState(
  local: Json,
  remote: Json,
  base: SyncBase,
  preferRemote: boolean,
  path = "",
): Json {
  const result: Json = { ...(preferRemote ? local : remote) };
  for (const field of new Set([
    ...Object.keys(local),
    ...Object.keys(remote),
  ])) {
    const l = local[field];
    const r = remote[field];
    const fieldPath = path ? `${path}.${field}` : field;
    if (
      (isRecordOfObjects(l) || isRecordOfObjects(r)) &&
      (l === undefined || isPlainObject(l)) &&
      (r === undefined || isPlainObject(r))
    ) {
      result[field] = mergeRecords(
        (l as Record<string, Json>) ?? {},
        (r as Record<string, Json>) ?? {},
        base[fieldPath],
        preferRemote,
      );
    } else if (Array.isArray(l) && Array.isArray(r)) {
      const seen = new Set<string>();
      result[field] = [...l, ...r].filter((item) => {
        const k = JSON.stringify(item);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else if (r === undefined) result[field] = l;
    else if (l === undefined) result[field] = r;
    else result[field] = preferRemote ? r : l;
  }
  return result;
}

/** Zustand persist envelopes keep the data under `state`. */
function body(value: Json): Json {
  return isPlainObject(value.state) ? value.state : value;
}

function withBody(envelope: Json, state: Json): Json {
  return isPlainObject(envelope.state) ? { ...envelope, state } : state;
}

/**
 * Merges a local and a cloud copy of one entry. `preferRemote` breaks ties
 * for plain values (the cloud copy is newer).
 */
export function mergeSyncedValue(
  local: Json | null,
  remote: Json | null,
  base: SyncBase,
  preferRemote: boolean,
): Json | null {
  if (!local) return remote;
  if (!remote) return local;
  const merged = mergeState(body(local), body(remote), base, preferRemote);
  const envelope = preferRemote ? remote : local;
  const version = Math.max(
    Number(local.version ?? 0),
    Number(remote.version ?? 0),
  );
  const out = withBody(envelope, merged);
  return isPlainObject(envelope.state) ? { ...out, version } : out;
}

/** Record ids of a value, per field path, to detect deletions next time. */
export function syncBaseOf(value: Json | null): SyncBase {
  const base: SyncBase = {};
  if (!value) return base;
  const state = body(value);
  for (const [field, v] of Object.entries(state)) {
    if (isRecordOfObjects(v)) base[field] = Object.keys(v);
  }
  return base;
}

function readLocal(key: string): Json | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readBase(key: string): SyncBase {
  try {
    return JSON.parse(localStorage.getItem(BASE_PREFIX + key) ?? "{}");
  } catch {
    return {};
  }
}

function writeBase(key: string, value: Json | null) {
  try {
    localStorage.setItem(BASE_PREFIX + key, JSON.stringify(syncBaseOf(value)));
  } catch {
    // quota: the next sync recomputes it
  }
}

async function signedInUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  // Anonymous sessions get a new identity per browser; syncing them would
  // only hide the data from the real account.
  if (!user || user.is_anonymous) return null;
  return user.id;
}

const lastPushed = new Map<string, string>();
let pulling: Promise<void> | null = null;

/** Merges every cloud copy into localStorage and rehydrates the stores. */
export function pullCloudState(): Promise<void> {
  if (!pulling) {
    pulling = (async () => {
      const userId = await signedInUserId();
      if (!userId || !supabase) return;
      const { data, error } = await supabase
        .from(TABLE)
        .select("key, value, updated_at")
        .in("key", [...CLOUD_SYNCED_KEYS]);
      if (error) {
        console.warn("[cloud-sync] pull failed", error.message);
        return;
      }
      const remoteByKey = new Map(
        (data ?? []).map((row) => [row.key as string, row.value as Json]),
      );
      for (const key of CLOUD_SYNCED_KEYS) {
        const remote = remoteByKey.get(key) ?? null;
        const local = readLocal(key);
        const merged = mergeSyncedValue(local, remote, readBase(key), true);
        const serialized = merged ? JSON.stringify(merged) : null;
        if (serialized && serialized !== localStorage.getItem(key)) {
          try {
            localStorage.setItem(key, serialized);
            rehydrators.get(key)?.();
          } catch (e) {
            console.warn("[cloud-sync] could not store", key, e);
          }
        }
        writeBase(key, merged);
        // The remote copy is now part of local; push only if local added to it.
        // Push next tick only if local holds something the cloud lacks.
        lastPushed.set(key, remote ? JSON.stringify(remote) : "");
      }
    })().finally(() => {
      pulling = null;
    });
  }
  return pulling;
}

/**
 * Pushes every entry that changed since it was last pushed, merged with the
 * current cloud copy first so another browser's newer projects survive.
 */
export async function pushCloudState(): Promise<void> {
  const userId = await signedInUserId();
  if (!userId || !supabase || pulling) return;
  const changed = CLOUD_SYNCED_KEYS.filter((key) => {
    const raw = localStorage.getItem(key);
    if (!raw || raw === lastPushed.get(key)) return false;
    if (raw.length > MAX_VALUE_BYTES) {
      console.warn(`[cloud-sync] ${key} is ${raw.length} bytes; not synced`);
      lastPushed.set(key, raw);
      return false;
    }
    return true;
  });
  if (changed.length === 0) return;
  const { data, error: readError } = await supabase
    .from(TABLE)
    .select("key, value")
    .in("key", changed);
  if (readError) {
    console.warn("[cloud-sync] push read failed", readError.message);
    return;
  }
  const remoteByKey = new Map(
    (data ?? []).map((row) => [row.key as string, row.value as Json]),
  );
  const rows: {
    user_id: string;
    key: string;
    value: Json;
    updated_at: string;
  }[] = [];
  for (const key of changed) {
    const local = readLocal(key);
    if (!local) continue;
    const merged =
      mergeSyncedValue(
        local,
        remoteByKey.get(key) ?? null,
        readBase(key),
        false,
      ) ?? local;
    const serialized = JSON.stringify(merged);
    if (serialized !== localStorage.getItem(key)) {
      try {
        localStorage.setItem(key, serialized);
        rehydrators.get(key)?.();
      } catch {
        // keep pushing the merged copy even if this browser is out of quota
      }
    }
    rows.push({
      user_id: userId,
      key,
      value: merged,
      updated_at: new Date().toISOString(),
    });
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from(TABLE).upsert(rows);
  if (error) {
    console.warn("[cloud-sync] push failed", error.message);
    return;
  }
  for (const row of rows) {
    lastPushed.set(row.key, localStorage.getItem(row.key) ?? "");
    writeBase(row.key, row.value);
  }
}

/** Starts the pull-on-sign-in + periodic push loop. Returns a stop function. */
export function startCloudStateSync(): () => void {
  if (!supabase) return () => {};
  pullCloudState();
  const timer = setInterval(() => {
    pushCloudState().catch(() => {});
  }, PUSH_INTERVAL_MS);
  const flush = () => {
    pushCloudState().catch(() => {});
  };
  window.addEventListener("pagehide", flush);
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      lastPushed.clear();
      pullCloudState();
    }
  });
  return () => {
    clearInterval(timer);
    window.removeEventListener("pagehide", flush);
    data.subscription.unsubscribe();
  };
}
