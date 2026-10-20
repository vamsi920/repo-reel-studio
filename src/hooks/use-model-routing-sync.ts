import { useEffect, useRef } from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { useSettings } from "#/hooks/query/use-settings";
import { useTracking } from "#/hooks/use-tracking";
import { resolveRoutingPreferences } from "#/lib/model-routing/prefs";
import { useModelRoutingStore } from "#/stores/model-routing-store";

/**
 * Keeps the routing store's snapshot (preferences + profile list) in step
 * with the active backend, so non-React callers — the WebSocket fallback
 * handler and app-side KT calls — can route without a QueryClient. Also the
 * single place routing telemetry is emitted, so each decision is tracked
 * exactly once regardless of which path made it.
 */
// @spec MR-015 — Routing snapshot sync + telemetry
export function useModelRoutingSync() {
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const { data: profileList } = useLlmProfiles();
  const { trackModelRouted, trackModelFallback } = useTracking();
  const syncSnapshot = useModelRoutingStore((s) => s.syncSnapshot);
  const latestDecisionId = useModelRoutingStore((s) => s.decisions[0]?.id);
  const lastTracked = useRef<string | undefined>(latestDecisionId);

  useEffect(() => {
    syncSnapshot({
      backendId: backend.id,
      prefs: resolveRoutingPreferences(settings),
      profiles: profileList?.profiles ?? [],
    });
  }, [backend.id, settings, profileList, syncSnapshot]);

  useEffect(() => {
    if (!latestDecisionId || latestDecisionId === lastTracked.current) return;
    lastTracked.current = latestDecisionId;
    const { decisions, prefs } = useModelRoutingStore.getState();
    const decision = decisions[0];
    if (!decision) return;
    if (decision.source === "fallback") {
      trackModelFallback({
        errorKind: decision.reasons[0] ?? "unknown",
        recovered: true,
        model: decision.model,
      });
      return;
    }
    // Sampled to switches: an unchanged model every turn is noise.
    if (!decision.switched) return;
    trackModelRouted({
      task: decision.task,
      source: decision.source,
      tier: decision.tier,
      policy: prefs.policy,
      model: decision.model,
      switched: decision.switched,
      classifierUsed: decision.source === "classifier",
    });
  }, [latestDecisionId, trackModelFallback, trackModelRouted]);
}
