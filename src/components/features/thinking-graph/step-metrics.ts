import type { OpenHandsEvent } from "#/types/agent-server/core";
import type { ConversationStats } from "#/types/agent-server/core/events/conversation-state-event";
import { isConversationStateUpdateEvent } from "#/types/agent-server/type-guards";

/** What one LLM response cost, as reported by the runtime (never estimated). */
export interface ResponseMetrics {
  tokens: number;
  latencyMs?: number;
  /** Only when the provider reported a cost we can tie to this response. */
  costUsd?: number;
}

function latestStats(
  events: readonly OpenHandsEvent[],
): ConversationStats | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (!isConversationStateUpdateEvent(event)) continue;
    const { key, value } = event as unknown as {
      key: string;
      value: { stats?: ConversationStats } & Partial<ConversationStats>;
    };
    if (key === "stats" && value?.usage_to_metrics) {
      return value as ConversationStats;
    }
    if (key === "full_state" && value?.stats?.usage_to_metrics) {
      return value.stats;
    }
  }
  return null;
}

/**
 * Per-LLM-response tokens / latency / cost keyed by response id, which is the
 * `llm_response_id` every ActionEvent of that response carries. Costs carry no
 * response id, so a cost is only attributed when a usage's cost list lines up
 * one-to-one with its token usages; otherwise it is left out, never guessed.
 */
export function buildResponseMetrics(
  events: readonly OpenHandsEvent[],
): Map<string, ResponseMetrics> {
  const metrics = new Map<string, ResponseMetrics>();
  const stats = latestStats(events);
  if (!stats) return metrics;
  for (const usage of Object.values(stats.usage_to_metrics)) {
    const aligned = usage.costs.length === usage.token_usages.length;
    usage.token_usages.forEach((tokenUsage, index) => {
      if (!tokenUsage.response_id) return;
      const latency = usage.response_latencies.find(
        (entry) => entry.response_id === tokenUsage.response_id,
      );
      metrics.set(tokenUsage.response_id, {
        tokens: tokenUsage.prompt_tokens + tokenUsage.completion_tokens,
        ...(latency ? { latencyMs: Math.round(latency.latency * 1000) } : {}),
        ...(aligned ? { costUsd: usage.costs[index].cost } : {}),
      });
    });
  }
  return metrics;
}

/** "420ms", "8s", "1m 12s", "1h 4m". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** "980", "1.2k", "34k". */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  return tokens < 10_000
    ? `${(tokens / 1000).toFixed(1)}k`
    : `${Math.round(tokens / 1000)}k`;
}

export function formatCost(usd: number): string {
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function eventTime(event: { timestamp?: string }): number | null {
  if (!event.timestamp) return null;
  const stamp = event.timestamp.endsWith("Z")
    ? event.timestamp
    : `${event.timestamp}Z`;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
}
