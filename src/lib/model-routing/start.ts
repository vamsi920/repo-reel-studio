import AgentOpsService, {
  isAgentOpsSupportedBackend,
} from "#/api/agentops-service/agentops-service.api";
import { recordModelSwitchMessage } from "#/hooks/chat/record-model-switch-message";
import { useModelRoutingStore } from "#/stores/model-routing-store";
import { buildCandidates } from "./catalog";
import { routeSync } from "./router";
import type { RoutingDecision } from "./types";

/**
 * Routes a new conversation's first message before the conversation exists,
 * so the right model starts the run (no switch-after-create round trip).
 * Synchronous — no classifier — to keep conversation start fast. Kept apart
 * from `runtime.ts` so the conversation service can import it without a
 * module cycle.
 */
// @spec MR-019 — Route at conversation start
export function routeConversationStart(args: {
  text: string | null | undefined;
  activeProfile: string | null;
}): RoutingDecision | null {
  const s = useModelRoutingStore.getState();
  const text = args.text?.trim();
  if (s.prefs.mode !== "auto" || !text || s.profiles.length === 0) return null;
  const { decision } = routeSync(
    {
      task: "conversation_start",
      text,
      needsTools: true,
      currentProfile: args.activeProfile,
    },
    {
      candidates: buildCandidates(s.profiles),
      policy: s.prefs.policy,
      budgetUsd: null,
      excludedProfiles: s.prefs.excludedProfiles,
      health: s.health,
      now: Date.now(),
    },
  );
  return decision.profileName ? decision : null;
}

/** Bookkeeping once the conversation id exists. */
export function recordConversationStartDecision(
  conversationId: string,
  decision: RoutingDecision,
): void {
  const store = useModelRoutingStore.getState();
  store.recordDecision(decision, conversationId);
  if (decision.profileName) {
    store.setCurrentProfile(conversationId, decision.profileName);
  }
  if (!decision.switched || !decision.profileName) return;
  recordModelSwitchMessage(
    conversationId,
    decision.profileName,
    null,
    decision,
  );
  if (isAgentOpsSupportedBackend()) {
    AgentOpsService.recordRouting(conversationId, {
      action: "model.routed",
      profile: decision.profileName,
      model: decision.model,
      tier: decision.tier,
      source: decision.source,
      reasons: decision.reasons,
      score: decision.score,
    }).catch(() => {});
  }
}
