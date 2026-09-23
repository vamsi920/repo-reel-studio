import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type { EnvironmentProfile } from "#/lib/environment/types/profile";
import { createEmptyProfile } from "#/lib/environment/types/profile";

/**
 * Unlike the connection repositories, this one writes.
 *
 * `environment_profiles` holds no credentials -- provider choices, network
 * posture, policy -- so org admins write it directly under RLS instead of
 * round-tripping through an Edge Function. The revision trigger on the table
 * records who changed what, which is the property that actually matters for a
 * multi-person onboarding.
 */
export interface EnvironmentProfileRepository {
  get(orgId: string): Promise<EnvironmentProfile | null>;
  put(orgId: string, profile: EnvironmentProfile): Promise<EnvironmentProfile>;
}

// Same fix as connections-repository.ts / github-connections-repository.ts /
// jira-connections-repository.ts / environment-checks-repository.ts: a
// genuine fetch failure (RLS denial, network error) previously returned null
// identically to "this org has never saved a profile", with no console
// signal -- and here that silently falls back to an empty default profile
// that an admin can then unknowingly persist over their real saved one.
function logFailure(step: string, error: unknown): void {
  console.error(`[environment-profile-repository] ${step} failed`, error);
}

class SupabaseEnvironmentProfileRepository implements EnvironmentProfileRepository {
  async get(orgId: string): Promise<EnvironmentProfile | null> {
    if (!isSupabaseConfigured || !supabase || !orgId) return null;
    const { data, error } = await supabase
      .from("environment_profiles")
      .select("doc, revision, updated_at, updated_by")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      logFailure("get", error);
      return null;
    }
    if (!data) return null;

    const doc = data.doc as Partial<EnvironmentProfile> | null;
    if (!doc || Object.keys(doc).length === 0) return null;

    // Merge over a fresh empty profile so a document written by an older
    // build is still usable: a missing section reads as its default rather
    // than as undefined halfway through a render.
    const base = createEmptyProfile(orgId, new Date().toISOString());
    return {
      ...base,
      ...doc,
      orgId,
      network: { ...base.network, ...(doc.network ?? {}) },
      policy: { ...base.policy, ...(doc.policy ?? {}) },
      runtime: { ...base.runtime, ...(doc.runtime ?? {}) },
      providers: { ...(doc.providers ?? {}) },
      meta: {
        ...base.meta,
        ...(doc.meta ?? {}),
        revision: (data.revision as number) ?? 0,
        updatedAt: (data.updated_at as string) ?? base.meta.updatedAt,
        updatedBy: (data.updated_by as string | null) ?? "",
      },
    };
  }

  async put(
    orgId: string,
    profile: EnvironmentProfile,
  ): Promise<EnvironmentProfile> {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error("environment profile storage is not configured");
    }
    const doc: EnvironmentProfile = {
      ...profile,
      orgId,
      meta: { ...profile.meta, updatedAt: new Date().toISOString() },
    };

    // Optimistic concurrency: a blind upsert here used to let two admins who
    // both loaded revision N race, with whoever wrote second silently
    // discarding the first's edits -- the row-level `record_environment_
    // profile_revision` trigger still logs every write to
    // `environment_profile_revisions`, so nothing is unrecoverable, but the
    // live doc lost data with no error shown to either admin. The trigger
    // always sets `revision` to `coalesce(old.revision, 0) + 1`, so an org
    // that has never saved a profile reads back as revision 0 from `get()`
    // and the first successful write becomes revision 1 -- `expectedRevision
    // > 0` is exactly "a row already exists".
    const expectedRevision = profile.meta.revision ?? 0;

    if (expectedRevision > 0) {
      const { data, error } = await supabase
        .from("environment_profiles")
        .update({ doc })
        .eq("org_id", orgId)
        .eq("revision", expectedRevision)
        .select("doc")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) {
        throw new Error(
          "This environment profile was changed by someone else since it was loaded. Reload and try again.",
        );
      }
      return doc;
    }

    // No row yet: insert rather than upsert, so two admins racing to save
    // the very first profile get a loud unique-violation on the loser
    // instead of one silently overwriting the other.
    const { error } = await supabase
      .from("environment_profiles")
      .insert({ org_id: orgId, doc });
    if (error) {
      if (error.code === "23505") {
        throw new Error(
          "This environment profile was just created by someone else. Reload and try again.",
        );
      }
      throw new Error(error.message);
    }
    return doc;
  }
}

export const environmentProfileRepository: EnvironmentProfileRepository =
  new SupabaseEnvironmentProfileRepository();
