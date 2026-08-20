import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

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
      await supabase.from("automation_metadata").upsert(
        {
          automation_id: input.automationId,
          workspace_id: input.workspaceId,
          proactivation_config: input.proactivationConfig ?? null,
        },
        { onConflict: "automation_id" },
      );
    } catch {
      // Best-effort companion data -- the Automation Server's own record is
      // still authoritative and unaffected.
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
      await supabase.from("proactivation_candidates").insert({
        workspace_id: input.workspaceId,
        automation_id: input.automationId ?? null,
        watch_area: input.watchArea ?? null,
        title: input.title,
        evidence: input.evidence ?? null,
        risk: input.risk ?? null,
        status: "proposed",
      });
    } catch {
      // Best-effort.
    }
  }
}

export const automationMetadataRepository: AutomationMetadataRepository =
  new SupabaseAutomationMetadataRepository();
