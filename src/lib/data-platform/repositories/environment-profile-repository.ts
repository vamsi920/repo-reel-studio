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

class SupabaseEnvironmentProfileRepository implements EnvironmentProfileRepository {
  async get(orgId: string): Promise<EnvironmentProfile | null> {
    if (!isSupabaseConfigured || !supabase || !orgId) return null;
    const { data, error } = await supabase
      .from("environment_profiles")
      .select("doc, revision, updated_at, updated_by")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error || !data) return null;

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
    const { error } = await supabase
      .from("environment_profiles")
      .upsert({ org_id: orgId, doc }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    return doc;
  }
}

export const environmentProfileRepository: EnvironmentProfileRepository =
  new SupabaseEnvironmentProfileRepository();
