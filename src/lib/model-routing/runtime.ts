import type { QueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import AgentServerConversationService from "#/api/conversation-service/agent-server-conversation-service.api";
import AgentOpsService, {
  isAgentOpsSupportedBackend,
  type AgentOpsRoutingAnnotation,
} from "#/api/agentops-service/agentops-service.api";
import {
  getStoredConversationMetadata,
  patchStoredConversationMetadata,
} from "#/api/conversation-metadata-store";
import { recordModelSwitchMessage } from "#/hooks/chat/record-model-switch-message";
import { invalidateConversationQueries } from "#/hooks/mutation/conversation-mutation-utils";
import { LLM_PROFILES_QUERY_KEYS } from "#/hooks/query/query-keys";
import useMetricsStore from "#/stores/metrics-store";
import { useModelStore } from "#/stores/model-store";
import { useModelRoutingStore } from "#/stores/model-routing-store";
import { buildCandidates } from "./catalog";
import { getRoutingClassifier } from "./classifier-transport";
import {
  FALLBACK_REASON,
  MAX_FALLBACK_HOPS,
  classifyLlmError,
  isRetryableKind,
  nextFallback,
  parseRetryAfterMs,
} from "./fallback";
import { effectiveState, type LlmErrorKind } from "./health";
import { resolveRoutingMode } from "./prefs";
import { route, type RoutingContext } from "./router";
import type { RouteRequest, RoutingDecision, RoutingMode } from "./types";

/**
 * Glue between the pure router and the running app: reads the routing store
 * snapshot, applies a decision through the existing per-conversation
 * `switchProfile` path, and reports it (chat chip, AgentOps audit).
 *
 * Deliberately not a hook so the WebSocket error handler can call it too.
 */
// @spec MR-013 — Chat routing runtime

export const SWITCH_TIMEOUT_MS = 3000;

export function getConversationRoutingMode(
  conversationId: string | null | undefined,
): RoutingMode {
  const { prefs, modeByConversation } = useModelRoutingStore.getState();
  if (!conversationId) return prefs.mode;
  return resolveRoutingMode(
    modeByConversation[conversationId] ??
      getStoredConversationMetadata(conversationId)?.routing_mode,
    prefs.mode,
  );
}

/** Per-chat Auto/manual override, persisted with the conversation metadata. */
export function setConversationRoutingMode(
  conversationId: string,
  mode: RoutingMode,
): void {
  useModelRoutingStore.getState().setConversationMode(conversationId, mode);
  patchStoredConversationMetadata(conversationId, { routing_mode: mode });
}

export function getConversationProfile(conversationId: string): string | null {
  return (
    useModelStore.getState().activeProfileByConversation[conversationId] ??
    useModelRoutingStore.getState().currentProfileByConversation[
      conversationId
    ] ??
    getStoredConversationMetadata(conversationId)?.active_profile ??
    null
  );
}

export function buildChatRoutingContext(conversationId: string | null) {
  const s = useModelRoutingStore.getState();
  const ctx: RoutingContext = {
    candidates: buildCandidates(s.profiles),
    policy: s.prefs.policy,
    budgetUsd: s.prefs.budgetUsd,
    excludedProfiles: s.prefs.excludedProfiles,
    health: s.health,
    sticky: conversationId ? s.sticky[conversationId] : undefined,
    now: Date.now(),
  };
  return ctx;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("switch timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function reportToAgentOps(
  conversationId: string,
  annotation: AgentOpsRoutingAnnotation,
) {
  if (!isAgentOpsSupportedBackend()) return;
  // Best effort: the collector may be down or not yet tracking this run.
  AgentOpsService.recordRouting(conversationId, annotation).catch(() => {});
}

function applySwitchLocally(
  conversationId: string,
  decision: RoutingDecision,
  queryClient?: QueryClient,
) {
  if (!decision.profileName) return;
  recordModelSwitchMessage(
    conversationId,
    decision.profileName,
    undefined,
    decision,
  );
  useModelRoutingStore
    .getState()
    .setCurrentProfile(conversationId, decision.profileName);
  patchStoredConversationMetadata(conversationId, {
    active_profile: decision.profileName,
  });
  if (queryClient) {
    queryClient.invalidateQueries({ queryKey: LLM_PROFILES_QUERY_KEYS.all });
    invalidateConversationQueries(queryClient, conversationId);
  }
}

export interface PrepareTurnArgs {
  conversationId: string;
  text: string;
  hasImages: boolean;
  /** Agent loop is running: a message joins it, so never switch mid-step. */
  isBusy: boolean;
  isAcp: boolean;
  queryClient?: QueryClient;
}

export interface PreparedTurn {
  decision: RoutingDecision;
  classifierUsed: boolean;
}

/**
 * Routes one user turn before it is sent. Returns null when Auto is off or
 * routing does not apply. Never throws and never blocks the send for more
 * than the switch timeout: on failure the turn goes out on the current model.
 */
export async function prepareChatTurn(
  args: PrepareTurnArgs,
): Promise<PreparedTurn | null> {
  const { conversationId, text, hasImages, isBusy, isAcp, queryClient } = args;
  const store = useModelRoutingStore.getState();
  store.startTurn(conversationId);
  if (isAcp || isBusy) return null;
  if (getConversationRoutingMode(conversationId) !== "auto") return null;
  if (store.profiles.length === 0) return null;

  const metrics = useMetricsStore.getState();
  const request: RouteRequest = {
    task: "chat_turn",
    text,
    hasImages,
    needsTools: true,
    contextTokens: metrics.usage?.per_turn_token ?? 0,
    conversationId,
    currentProfile: getConversationProfile(conversationId),
    conversationCostUsd: metrics.cost ?? undefined,
  };

  try {
    const ctx = buildChatRoutingContext(conversationId);
    const outcome = await route(request, ctx, getRoutingClassifier());
    let { decision } = outcome;
    const classifierUsed = decision.source === "classifier";

    if (decision.switched && decision.profileName) {
      try {
        await withTimeout(
          AgentServerConversationService.switchProfile(
            conversationId,
            decision.profileName,
          ),
          SWITCH_TIMEOUT_MS,
        );
        applySwitchLocally(conversationId, decision, queryClient);
        reportToAgentOps(conversationId, {
          action: "model.routed",
          profile: decision.profileName,
          model: decision.model,
          tier: decision.tier,
          source: decision.source,
          reasons: decision.reasons,
          score: decision.score,
          fromProfile: request.currentProfile ?? null,
        });
      } catch {
        // Send anyway on the current model; the decision log records it.
        decision = {
          ...decision,
          profileName: request.currentProfile ?? decision.profileName,
          switched: false,
        };
      }
    } else if (!request.currentProfile && decision.profileName) {
      useModelRoutingStore
        .getState()
        .setCurrentProfile(conversationId, decision.profileName);
    }

    useModelRoutingStore.getState().advanceSticky(conversationId, {
      switched: decision.switched,
      wantedLower: outcome.wantedLower,
    });
    useModelRoutingStore.getState().recordDecision(decision, conversationId);
    return { decision, classifierUsed };
  } catch {
    return null;
  }
}

export interface FallbackOutcome {
  kind: LlmErrorKind;
  recovered: boolean;
  decision: RoutingDecision | null;
}

/**
 * Called for every conversation error event. Always feeds the health circuit
 * (manual mode too); in Auto mode, also switches to the next healthy profile
 * and resumes the run — at most {@link MAX_FALLBACK_HOPS} times per turn.
 */
export async function handleLlmErrorForRouting(args: {
  conversationId: string;
  code: string | null | undefined;
  detail: string | null | undefined;
  queryClient?: QueryClient;
}): Promise<FallbackOutcome | null> {
  const { conversationId, code, detail, queryClient } = args;
  const kind = classifyLlmError(code, detail);
  if (!kind) return null;

  const store = useModelRoutingStore.getState();
  const currentName = getConversationProfile(conversationId);
  if (currentName) {
    store.markFailure(currentName, kind, parseRetryAfterMs(detail));
  }

  const none: FallbackOutcome = { kind, recovered: false, decision: null };
  if (getConversationRoutingMode(conversationId) !== "auto") return none;
  if (!isRetryableKind(kind)) return none;
  const turn = store.fallbackByConversation[conversationId];
  if ((turn?.hops ?? 0) >= MAX_FALLBACK_HOPS) return none;

  const ctx = buildChatRoutingContext(conversationId);
  const candidates = ctx.candidates.filter(
    (c) => !ctx.excludedProfiles.includes(c.profileName),
  );
  const current = candidates.find((c) => c.profileName === currentName) ?? null;
  const next = nextFallback({
    current,
    kind,
    candidates,
    // Read health after markFailure so the failed profile's circuit counts.
    health: useModelRoutingStore.getState().health,
    tried: turn?.tried ?? [],
    now: Date.now(),
  });
  if (!next) return none;

  store.recordFallbackHop(conversationId, currentName ?? next.profileName);
  const decision: RoutingDecision = {
    id: uuidv4(),
    task: "chat_turn",
    profileName: next.profileName,
    model: next.model,
    tier: next.tier,
    source: "fallback",
    reasons: [
      FALLBACK_REASON[kind as keyof typeof FALLBACK_REASON] ??
        "fallback_unavailable",
    ],
    score: null,
    confidence: null,
    rejected: currentName
      ? [{ profileName: currentName, reason: "circuit_open" }]
      : [],
    switched: true,
    at: Date.now(),
  };

  try {
    await withTimeout(
      AgentServerConversationService.switchProfile(
        conversationId,
        next.profileName,
      ),
      SWITCH_TIMEOUT_MS,
    );
    applySwitchLocally(conversationId, decision, queryClient);
    const resumed =
      await AgentServerConversationService.resumeConversation(conversationId);
    useModelRoutingStore.getState().recordDecision(decision, conversationId);
    reportToAgentOps(conversationId, {
      action: "model.fallback",
      profile: next.profileName,
      model: next.model,
      tier: next.tier,
      source: "fallback",
      reasons: decision.reasons,
      fromProfile: currentName,
      errorKind: kind,
    });
    return { kind, recovered: resumed, decision };
  } catch {
    return none;
  }
}

/** Closes half-open circuits as soon as the current profile answers again. */
export function noteConversationLlmSuccess(conversationId: string): void {
  const name = getConversationProfile(conversationId);
  if (!name) return;
  const health = useModelRoutingStore.getState().health[name];
  // Only a half-open circuit is waiting on proof of life; an open one is
  // still cooling down (stats can also arrive from the condenser LLM).
  if (health && effectiveState(health, Date.now()) === "half_open") {
    useModelRoutingStore.getState().markSuccess(name);
  }
}
