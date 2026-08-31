import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";
import type {
  ProbeCheck,
  ProbeVantage,
  Remediation,
} from "#/lib/environment/types/probe";

/** One row of the probe ledger, as shown in the Runbook tab. */
export interface EnvironmentCheckRecord {
  id: string;
  kind: string;
  target: string;
  vantage: ProbeVantage;
  ok: boolean;
  latencyMs: number | null;
  checks: ProbeCheck[];
  remediation: Remediation | null;
  createdAt: string;
}

export interface EnvironmentChecksRepository {
  recent(orgId: string, limit?: number): Promise<EnvironmentCheckRecord[]>;
}

class SupabaseEnvironmentChecksRepository implements EnvironmentChecksRepository {
  async recent(orgId: string, limit = 50): Promise<EnvironmentCheckRecord[]> {
    if (!isSupabaseConfigured || !supabase || !orgId) return [];
    const { data, error } = await supabase
      .from("environment_checks")
      .select(
        "id, kind, target, vantage, ok, latency_ms, checks, remediation, created_at",
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      kind: row.kind as string,
      target: row.target as string,
      vantage: row.vantage as ProbeVantage,
      ok: row.ok as boolean,
      latencyMs: (row.latency_ms as number | null) ?? null,
      checks: (row.checks as ProbeCheck[]) ?? [],
      remediation: (row.remediation as Remediation | null) ?? null,
      createdAt: row.created_at as string,
    }));
  }
}

export const environmentChecksRepository: EnvironmentChecksRepository =
  new SupabaseEnvironmentChecksRepository();
