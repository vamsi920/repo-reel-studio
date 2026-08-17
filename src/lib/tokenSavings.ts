// Token-savings data layer — reads the durable `token_savings_events` table
// (and its `token_savings_daily` rollup view) that Agent Ops + Proactive
// Agent write to every time a prompt is compressed (see server/token_savings.py).

import { supabase } from "./supabaseClient";

export type TokenSavingsSource = "agent_ops" | "proactive";

export interface TokenSavingsEvent {
  id: string;
  source: TokenSavingsSource;
  label: string;
  run_id: string | null;
  project_id: string | null;
  original_chars: number;
  compressed_chars: number;
  saved_chars: number;
  saved_tokens: number;
  compression_ratio: number | null;
  created_at: string;
}

export interface TokenSavingsDailyRow {
  day: string;
  source: TokenSavingsSource;
  events: number;
  saved_tokens: number;
  saved_chars: number;
  avg_compression_ratio: number | null;
}

export interface TokenSavingsSummary {
  totalSavedTokens: number;
  totalEvents: number;
  avgCompressionRatio: number;
  bySource: Record<TokenSavingsSource, { events: number; savedTokens: number }>;
}

const EMPTY_SUMMARY: TokenSavingsSummary = {
  totalSavedTokens: 0,
  totalEvents: 0,
  avgCompressionRatio: 0,
  bySource: {
    agent_ops: { events: 0, savedTokens: 0 },
    proactive: { events: 0, savedTokens: 0 },
  },
};

/** All-time totals, split by source. Cheap: aggregated server-side via count/sum. */
export async function getTokenSavingsSummary(): Promise<TokenSavingsSummary> {
  if (!supabase) return EMPTY_SUMMARY;
  try {
    const { data, error } = await supabase
      .from("token_savings_events")
      .select("source, saved_tokens, compression_ratio");
    if (error || !data) return EMPTY_SUMMARY;

    const summary: TokenSavingsSummary = {
      totalSavedTokens: 0,
      totalEvents: 0,
      avgCompressionRatio: 0,
      bySource: {
        agent_ops: { events: 0, savedTokens: 0 },
        proactive: { events: 0, savedTokens: 0 },
      },
    };
    let ratioSum = 0;
    let ratioCount = 0;
    for (const row of data as Array<{ source: TokenSavingsSource; saved_tokens: number; compression_ratio: number | null }>) {
      summary.totalSavedTokens += row.saved_tokens;
      summary.totalEvents += 1;
      const bucket = summary.bySource[row.source];
      if (bucket) {
        bucket.events += 1;
        bucket.savedTokens += row.saved_tokens;
      }
      if (typeof row.compression_ratio === "number") {
        ratioSum += row.compression_ratio;
        ratioCount += 1;
      }
    }
    summary.avgCompressionRatio = ratioCount ? ratioSum / ratioCount : 0;
    return summary;
  } catch {
    return EMPTY_SUMMARY;
  }
}

/** Daily rollup for the last `days` days, from the pre-aggregated view. */
export async function getTokenSavingsDaily(days = 30): Promise<TokenSavingsDailyRow[]> {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("token_savings_daily")
      .select("*")
      .gte("day", since)
      .order("day", { ascending: true });
    if (error || !data) return [];
    return data as TokenSavingsDailyRow[];
  } catch {
    return [];
  }
}

/** Most recent events, for a "recent activity" table. */
export async function getRecentTokenSavingsEvents(limit = 20): Promise<TokenSavingsEvent[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("token_savings_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as TokenSavingsEvent[];
  } catch {
    return [];
  }
}

/** Total tokens saved for one agent run (for the RunInspectorFactStrip chip). */
export async function getTokenSavingsForRun(runId: string): Promise<number> {
  if (!supabase || !runId) return 0;
  try {
    const { data, error } = await supabase
      .from("token_savings_events")
      .select("saved_tokens")
      .eq("run_id", runId);
    if (error || !data) return 0;
    return data.reduce((sum, row: { saved_tokens: number }) => sum + row.saved_tokens, 0);
  } catch {
    return 0;
  }
}

/** All-time total for one source (for the Proactive dashboard header). */
export async function getTokenSavingsForSource(
  source: TokenSavingsSource
): Promise<{ events: number; savedTokens: number }> {
  if (!supabase) return { events: 0, savedTokens: 0 };
  try {
    const { data, error } = await supabase
      .from("token_savings_events")
      .select("saved_tokens")
      .eq("source", source);
    if (error || !data) return { events: 0, savedTokens: 0 };
    return {
      events: data.length,
      savedTokens: data.reduce((sum, row: { saved_tokens: number }) => sum + row.saved_tokens, 0),
    };
  } catch {
    return { events: 0, savedTokens: 0 };
  }
}

/** Rough, clearly-labeled cost estimate. Not billing-accurate — for the
 * dashboard's "why this matters" framing only. */
const ESTIMATED_USD_PER_1K_TOKENS = 0.002;

export function estimateCostSavedUsd(tokens: number): number {
  return (tokens / 1000) * ESTIMATED_USD_PER_1K_TOKENS;
}
