import { supabase, isSupabaseConfigured } from "#/lib/data-platform/client";

/**
 * Enqueue-only from the browser -- there is deliberately no `dequeue`/consume
 * method here. Consumers are Supabase Edge Functions (the decision recorded
 * in docs/supabase-current-state.md: privileged/background work runs as Edge
 * Functions, not a new Node sidecar), triggered by pgmq + pg_cron, both
 * enabled in supabase/migrations/*_enable_extensions.sql.
 */
export interface JobQueue {
  enqueue(
    queueName: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean }>;
}

class SupabasePgmqJobQueue implements JobQueue {
  async enqueue(
    queueName: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    if (!isSupabaseConfigured || !supabase) return { ok: true };
    try {
      // pgmq.send is exposed as a database function; calling it via `rpc`
      // requires the wrapper to exist in the project (added when a given
      // queue is actually created by its owning Edge Function migration).
      const { error } = await supabase.schema("pgmq").rpc("send", {
        queue_name: queueName,
        msg: payload,
      });
      return { ok: !error };
    } catch {
      return { ok: false };
    }
  }
}

export const jobQueue: JobQueue = new SupabasePgmqJobQueue();
