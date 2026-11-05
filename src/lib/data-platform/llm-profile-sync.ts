import { supabase } from "#/lib/data-platform/client";
import { getActiveBackend } from "#/api/backend-registry/active-store";
import ProfilesService, {
  type SaveProfileRequest,
} from "#/api/profiles-service/profiles-service.api";

/**
 * Keeps the user's saved LLM profiles (with their API keys) the same on
 * every agent-server they use. The copy lives encrypted in the user-vault
 * edge function; this module reconciles it with the active server:
 * profiles missing here are created, profiles deleted here (since the last
 * sync on this server) are dropped from the vault, edits made here win.
 */

const VAULT_FUNCTION = "user-vault";
const VAULT_KEY = "llm_profiles";
const BASE_PREFIX = "neodevex-llm-profile-sync-base:";

type ProfileConfigs = Record<string, Record<string, unknown>>;

async function signedIn(): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return Boolean(user && !user.is_anonymous);
}

async function readVault(): Promise<ProfileConfigs | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke(VAULT_FUNCTION, {
    body: { action: "get", key: VAULT_KEY },
  });
  if (error) throw error;
  const value = (data as { value?: { profiles?: ProfileConfigs } | null })
    ?.value;
  return value?.profiles ?? {};
}

async function writeVault(profiles: ProfileConfigs): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke(VAULT_FUNCTION, {
    body: { action: "put", key: VAULT_KEY, value: { profiles } },
  });
  if (error) throw error;
}

function baseKey(): string {
  return BASE_PREFIX + getActiveBackend().backend.host;
}

function readBase(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(baseKey()) ?? "[]"));
  } catch {
    return new Set();
  }
}

function writeBase(names: string[]) {
  try {
    localStorage.setItem(baseKey(), JSON.stringify(names));
  } catch {
    // quota: next sync treats everything as new, which only re-creates
  }
}

async function readLocalProfiles(): Promise<ProfileConfigs> {
  const { profiles } = await ProfilesService.listProfiles();
  const result: ProfileConfigs = {};
  for (const profile of profiles ?? []) {
    const detail = await ProfilesService.getProfile(profile.name, "plaintext");
    result[profile.name] = detail.config;
  }
  return result;
}

/** JSON with object keys sorted at every level, for change detection. */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * One reconciliation pass for the active agent-server. Returns the names
 * created here. Cloud (OpenHands Cloud) backends never expose profile
 * secrets and are skipped.
 */
export async function syncLlmProfiles(): Promise<string[]> {
  if (!(await signedIn())) return [];
  if (getActiveBackend().backend.kind === "cloud") return [];
  const [local, remote] = await Promise.all([readLocalProfiles(), readVault()]);
  if (!remote) return [];
  const base = readBase();
  const created: string[] = [];
  const merged: ProfileConfigs = { ...remote };

  for (const name of Object.keys(remote)) {
    if (local[name]) continue;
    if (base.has(name)) {
      // Deleted on this server since the last sync.
      delete merged[name];
      continue;
    }
    const request = {
      llm: remote[name],
      include_secrets: true,
    } as unknown as SaveProfileRequest;
    try {
      await ProfilesService.saveProfile(name, request);
      created.push(name);
    } catch (error) {
      console.warn("[llm-profile-sync] could not create", name, error);
    }
  }
  for (const [name, config] of Object.entries(local)) merged[name] = config;

  const changed =
    Object.keys(merged).length !== Object.keys(remote).length ||
    Object.entries(merged).some(
      ([name, config]) => stable(config) !== stable(remote[name]),
    );
  if (changed) await writeVault(merged);
  writeBase(Object.keys(merged));
  return created;
}
