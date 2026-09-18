import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

// A genuine write failure (RLS denial, constraint violation, schema
// mismatch) previously returned exactly like a successful write, with no
// console signal at all -- the caller's toggle would appear saved, then
// silently revert on the next reload with nothing to explain why. Same fix
// already applied across the sibling repositories in this directory
// (connections-repository.ts, github/jira-connections-repository.ts, etc.).
function logFailure(step: string, error: unknown): void {
  console.error(`[automation-metadata-repository] ${step} failed`, error);
}

/**
 * Companion to the external Automation Server's own `Automation` record
 * (src/api/automation-service/), which remains authoritative for the record
 * itself -- no FK is possible since it's a different database. This table
 * gives richer, queryable storage for Proactivation config that today is
 * smuggled into `Automation.prompt` as an HTML comment marker (see
 * src/utils/proactivation-prompt.ts, which keeps working unchanged).
 */
export interface AutomationMetadataRepository {
  upsert(input: {
    automationId: string;
    workspaceId: string;
    proactivationConfig?: Record<string, unknown>;
  }): Promise<void>;
  recordCandidate(input: {
    workspaceId: string;
    automationId?: string;
    watchArea?: string;
    title: string;
    evidence?: Record<string, unknown>;
    risk?: string;
  }): Promise<void>;
}

class SupabaseAutomationMetadataRepository implements AutomationMetadataRepository {
  async upsert(input: {
    automationId: string;
    workspaceId: string;
    proactivationConfig?: Record<string, unknown>;
  }): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase.from("automation_metadata").upsert(
        {
          automation_id: input.automationId,
          workspace_id: input.workspaceId,
          proactivation_config: input.proactivationConfig ?? null,
        },
        { onConflict: "automation_id" },
      );
      if (error) logFailure("upsert", error);
    } catch (error) {
      logFailure("upsert", error);
    }
  }

  async recordCandidate(input: {
    workspaceId: string;
    automationId?: string;
    watchArea?: string;
    title: string;
    evidence?: Record<string, unknown>;
    risk?: string;
  }): Promise<void> {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      const { error } = await supabase.from("proactivation_candidates").insert({
        workspace_id: input.workspaceId,
        automation_id: input.automationId ?? null,
        watch_area: input.watchArea ?? null,
        title: input.title,
        evidence: input.evidence ?? null,
        risk: input.risk ?? null,
        status: "proposed",
      });
      if (error) logFailure("recordCandidate", error);
    } catch (error) {
      logFailure("recordCandidate", error);
    }
  }
}

export const automationMetadataRepository: AutomationMetadataRepository =
  new SupabaseAutomationMetadataRepository();
