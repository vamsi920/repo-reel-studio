import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import {
  createEmptyCompanyProfile,
  type CompanyProfile,
  type DiscoveryFact,
} from "#/lib/environment/types/company";
import type { RuntimeCheckRecord } from "#/stores/onboarding-studio-store";

/** The profile as stored, plus connections checked from the agent's runtime. */
export type StoredCompanyProfile = CompanyProfile & {
  runtimeChecks?: RuntimeCheckRecord[];
};

/**
 * The org's company profile: what the onboarding agent learned about this
 * company, kept on the org rather than in one browser.
 *
 * The onboarding case study (case-studies/onboarding) found the table had
 * never been written: every fact lived in one tab's localStorage and was
 * cleared when a new setup conversation started, so a second session (or a
 * colleague, or another device) began from nothing and asked everything
 * again. Members write it directly under RLS; the revision trigger keeps the
 * history of who changed what.
 */
export interface CompanyProfileRepository {
  get(orgId: string): Promise<StoredCompanyProfile | null>;
  /** Merge facts by key (newer wins) and save. Returns the merged list. */
  mergeFacts(orgId: string, facts: DiscoveryFact[]): Promise<DiscoveryFact[]>;
  /**
   * Keep the latest runtime check per provider instance. The `connections`
   * row cannot record it (only service-role Edge Functions write there), and
   * without it the next session would see a private-network connection as
   * failing.
   */
  recordRuntimeCheck(orgId: string, record: RuntimeCheckRecord): Promise<void>;
}

function logFailure(step: string, error: unknown): void {
  console.error(`[company-profile-repository] ${step} failed`, error);
}

/** Union by key; when both sides have a key, the later `at` wins. */
export function mergeFactsByKey(
  existing: DiscoveryFact[],
  incoming: DiscoveryFact[],
): DiscoveryFact[] {
  const byKey = new Map(existing.map((fact) => [fact.key, fact]));
  for (const fact of incoming) {
    const current = byKey.get(fact.key);
    if (!current || Date.parse(fact.at) >= Date.parse(current.at)) {
      byKey.set(fact.key, fact);
    }
  }
  return [...byKey.values()];
}

class SupabaseCompanyProfileRepository implements CompanyProfileRepository {
  async get(orgId: string): Promise<StoredCompanyProfile | null> {
    if (!isSupabaseConfigured || !supabase || !orgId) return null;
    const { data, error } = await supabase
      .from("company_profiles")
      .select("doc, revision")
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) {
      logFailure("get", error);
      return null;
    }
    if (!data) return null;
    const doc = (data.doc ?? {}) as Partial<StoredCompanyProfile>;
    const base = createEmptyCompanyProfile(orgId, new Date().toISOString());
    return {
      ...base,
      ...doc,
      orgId,
      facts: Array.isArray(doc.facts) ? doc.facts : [],
      runtimeChecks: Array.isArray(doc.runtimeChecks) ? doc.runtimeChecks : [],
      meta: { ...base.meta, ...(doc.meta ?? {}), revision: data.revision ?? 0 },
    };
  }

  async mergeFacts(
    orgId: string,
    facts: DiscoveryFact[],
  ): Promise<DiscoveryFact[]> {
    if (!isSupabaseConfigured || !supabase || !orgId) return facts;
    const current = await this.get(orgId);
    const now = new Date().toISOString();
    const profile = current ?? createEmptyCompanyProfile(orgId, now);
    const merged = mergeFactsByKey(profile.facts, facts);
    await this.save(orgId, { ...profile, facts: merged }, now);
    return merged;
  }

  async recordRuntimeCheck(
    orgId: string,
    record: RuntimeCheckRecord,
  ): Promise<void> {
    if (!isSupabaseConfigured || !supabase || !orgId) return;
    const now = new Date().toISOString();
    const profile =
      (await this.get(orgId)) ?? createEmptyCompanyProfile(orgId, now);
    const runtimeChecks = [
      ...((profile as StoredCompanyProfile).runtimeChecks ?? []).filter(
        (existing) =>
          existing.providerId !== record.providerId ||
          existing.instanceKey !== record.instanceKey,
      ),
      record,
    ];
    await this.save(orgId, { ...profile, runtimeChecks }, now);
  }

  private async save(
    orgId: string,
    profile: StoredCompanyProfile,
    now: string,
  ): Promise<void> {
    if (!supabase) return;
    const doc: StoredCompanyProfile = {
      ...profile,
      meta: { ...profile.meta, updatedAt: now },
    };
    const { error } = await supabase
      .from("company_profiles")
      .upsert({ org_id: orgId, doc }, { onConflict: "org_id" });
    if (error) {
      logFailure("save", error);
      throw new Error(error.message);
    }
  }
}

export const companyProfileRepository: CompanyProfileRepository =
  new SupabaseCompanyProfileRepository();
