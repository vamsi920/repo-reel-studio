import {
  compressForPrompt,
  estimateTokens,
  type LaymanBriefMode,
  type LaymanPromptCompressionFallbackReason,
  type LaymanPromptCompressionResult,
} from "@/lib/laymanCompressionCore";
import { LAYMAN_PROMPT_ENABLED } from "@/env";

export type LaymanCompressionContext =
  | "video_prose_context"
  | "codegraph_narrative"
  | "repo_investigator_memory";

export type LaymanCompressionPolicy = {
  enabled: boolean;
  mode: LaymanBriefMode;
  minSavedTokens: number;
  allowContexts: LaymanCompressionContext[];
  denyContexts: LaymanCompressionContext[];
  debug: boolean;
};

export type LaymanPolicyDecision = {
  allowed: boolean;
  reason: "policy_disabled" | "context_denied" | "context_not_allowed" | "allowed";
  context: LaymanCompressionContext;
  policy: LaymanCompressionPolicy;
};

export type LaymanCompressionInstrumentationEvent = {
  context: LaymanCompressionContext;
  mode: LaymanBriefMode;
  usedCompression: boolean;
  skippedReason:
    | LaymanPromptCompressionFallbackReason
    | "policy_disabled"
    | "context_denied"
    | "context_not_allowed"
    | "rollback_after_schema_parse_failure"
    | "rollback_after_quality_validation_failure"
    | "rollback_after_local_validation_failure"
    | null;
  originalEstimate: number;
  compressedEstimate: number;
  savedTokens: number;
};

export type LaymanCompressionInstrumentationReport = {
  totalEvents: number;
  totalSavedTokens: number;
  byContext: Record<
    LaymanCompressionContext,
    {
      events: number;
      savedTokens: number;
      skipped: number;
    }
  >;
};

export type LaymanIntegrationSafetyPolicy = {
  localDeterministicOnly: true;
  mutatePersistedRepoFiles: false;
  createOriginalBackupFiles: false;
  callLaymanRemoteServices: false;
  callAnthropicForCompression: false;
};

const SAFE_DEFAULT_CONTEXTS: LaymanCompressionContext[] = [
  "video_prose_context",
  "codegraph_narrative",
  "repo_investigator_memory",
];

const DEFAULT_POLICY: LaymanCompressionPolicy = {
  enabled: LAYMAN_PROMPT_ENABLED,
  mode: "full",
  minSavedTokens: 2,
  allowContexts: [...SAFE_DEFAULT_CONTEXTS],
  denyContexts: [],
  debug: false,
};

// Safety boundary for this app integration:
// - prompt compression is in-memory only
// - no persisted file mutation
// - no .original backup creation
// - no external layman service calls
// - no Anthropic/API calls for compression
const LAYMAN_INTEGRATION_SAFETY_POLICY: LaymanIntegrationSafetyPolicy = {
  localDeterministicOnly: true,
  mutatePersistedRepoFiles: false,
  createOriginalBackupFiles: false,
  callLaymanRemoteServices: false,
  callAnthropicForCompression: false,
};

let activePolicy: LaymanCompressionPolicy = { ...DEFAULT_POLICY };
const instrumentationEvents: LaymanCompressionInstrumentationEvent[] = [];

function isDevRuntime(): boolean {
  try {
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

function shouldInstrument(policy: LaymanCompressionPolicy): boolean {
  return policy.debug || isDevRuntime();
}

function recordInstrumentationEvent(event: LaymanCompressionInstrumentationEvent): void {
  instrumentationEvents.push(event);
}

export function clearLaymanCompressionInstrumentation(): void {
  instrumentationEvents.length = 0;
}

export function recordLaymanCompressionRollback(event: {
  context: LaymanCompressionContext;
  mode: LaymanBriefMode;
  reason:
    | "rollback_after_schema_parse_failure"
    | "rollback_after_quality_validation_failure"
    | "rollback_after_local_validation_failure";
  originalEstimate: number;
}): void {
  const policy = getLaymanCompressionPolicy();
  if (!shouldInstrument(policy)) return;
  recordInstrumentationEvent({
    context: event.context,
    mode: event.mode,
    usedCompression: false,
    skippedReason: event.reason,
    originalEstimate: event.originalEstimate,
    compressedEstimate: event.originalEstimate,
    savedTokens: 0,
  });
  if (policy.debug) {
    console.debug(
      JSON.stringify({
        event: "layman_compression_rollback",
        context: event.context,
        mode: event.mode,
        skippedReason: event.reason,
        originalEstimate: event.originalEstimate,
      }),
    );
  }
}

export function getLaymanCompressionInstrumentationReport(): LaymanCompressionInstrumentationReport {
  const base: LaymanCompressionInstrumentationReport["byContext"] = {
    video_prose_context: { events: 0, savedTokens: 0, skipped: 0 },
    codegraph_narrative: { events: 0, savedTokens: 0, skipped: 0 },
    repo_investigator_memory: { events: 0, savedTokens: 0, skipped: 0 },
  };
  for (const event of instrumentationEvents) {
    const bucket = base[event.context];
    bucket.events += 1;
    bucket.savedTokens += event.savedTokens;
    if (!event.usedCompression) bucket.skipped += 1;
  }
  return {
    totalEvents: instrumentationEvents.length,
    totalSavedTokens: instrumentationEvents.reduce((sum, event) => sum + event.savedTokens, 0),
    byContext: base,
  };
}

export function getLaymanCompressionPolicy(): LaymanCompressionPolicy {
  return { ...activePolicy, allowContexts: [...activePolicy.allowContexts], denyContexts: [...activePolicy.denyContexts] };
}

export function getLaymanIntegrationSafetyPolicy(): LaymanIntegrationSafetyPolicy {
  return LAYMAN_INTEGRATION_SAFETY_POLICY;
}

export function configureLaymanCompressionPolicy(
  updates: Partial<LaymanCompressionPolicy>,
): LaymanCompressionPolicy {
  activePolicy = {
    ...activePolicy,
    ...updates,
    allowContexts: updates.allowContexts ? [...updates.allowContexts] : [...activePolicy.allowContexts],
    denyContexts: updates.denyContexts ? [...updates.denyContexts] : [...activePolicy.denyContexts],
  };
  return getLaymanCompressionPolicy();
}

export function resetLaymanCompressionPolicy(): LaymanCompressionPolicy {
  activePolicy = { ...DEFAULT_POLICY, allowContexts: [...DEFAULT_POLICY.allowContexts], denyContexts: [] };
  return getLaymanCompressionPolicy();
}

export function evaluateLaymanPolicy(context: LaymanCompressionContext): LaymanPolicyDecision {
  const policy = getLaymanCompressionPolicy();
  if (!policy.enabled) {
    return { allowed: false, reason: "policy_disabled", context, policy };
  }
  if (policy.denyContexts.includes(context)) {
    return { allowed: false, reason: "context_denied", context, policy };
  }
  if (policy.allowContexts.length > 0 && !policy.allowContexts.includes(context)) {
    return { allowed: false, reason: "context_not_allowed", context, policy };
  }
  return { allowed: true, reason: "allowed", context, policy };
}

export function compressForPromptWithPolicy(params: {
  context: LaymanCompressionContext;
  path: string;
  text: string;
  mode?: LaymanBriefMode;
  minSavedTokens?: number;
  simplifyProse?: (proseTemplate: string, mode: LaymanBriefMode) => string;
}): LaymanPromptCompressionResult & { policyDecision: LaymanPolicyDecision } {
  // Enforce local deterministic boundary before any compression attempt.
  const safety = getLaymanIntegrationSafetyPolicy();
  if (
    !safety.localDeterministicOnly ||
    safety.mutatePersistedRepoFiles ||
    safety.createOriginalBackupFiles ||
    safety.callLaymanRemoteServices ||
    safety.callAnthropicForCompression
  ) {
    throw new Error("Layman compression safety boundary violated");
  }

  const decision = evaluateLaymanPolicy(params.context);
  const originalEstimate = estimateTokens(params.text);
  if (!decision.allowed) {
    const blocked = {
      text: params.text,
      usedCompression: false,
      fallbackReason: "noncompressible",
      mode: decision.policy.mode,
      metrics: {
        mode: decision.policy.mode,
        originalTokens: originalEstimate,
        compressedTokens: originalEstimate,
        savedTokens: 0,
      },
      eligibility: {
        shouldCompress: false,
        reason: "not_natural_language",
        refusal: {
          code: "not_natural_language",
          message: `Compression blocked by policy: ${decision.reason}`,
        },
      },
      validation: null,
      policyDecision: decision,
    };
    if (shouldInstrument(decision.policy)) {
      const skippedReason =
        decision.reason === "policy_disabled"
          ? "policy_disabled"
          : decision.reason === "context_denied"
            ? "context_denied"
            : "context_not_allowed";
      recordInstrumentationEvent({
        context: params.context,
        mode: blocked.mode,
        usedCompression: false,
        skippedReason,
        originalEstimate,
        compressedEstimate: originalEstimate,
        savedTokens: 0,
      });
      if (decision.policy.debug) {
        console.debug(
          JSON.stringify({
            event: "layman_policy_compression",
            context: params.context,
            mode: blocked.mode,
            usedCompression: false,
            skippedReason,
            originalEstimate,
            compressedEstimate: originalEstimate,
            savedTokens: 0,
          }),
        );
      }
    }
    return blocked;
  }

  const result = compressForPrompt(params.text, {
    path: params.path,
    mode: params.mode ?? decision.policy.mode,
    minSavedTokens: params.minSavedTokens ?? decision.policy.minSavedTokens,
    simplifyProse: params.simplifyProse,
  });

  if (shouldInstrument(decision.policy)) {
    recordInstrumentationEvent({
      context: params.context,
      mode: result.mode,
      usedCompression: result.usedCompression,
      skippedReason: result.usedCompression ? null : result.fallbackReason,
      originalEstimate: result.metrics.originalTokens,
      compressedEstimate: result.metrics.compressedTokens,
      savedTokens: result.metrics.savedTokens,
    });
    if (decision.policy.debug) {
      console.debug(
        JSON.stringify({
          event: "layman_policy_compression",
          context: params.context,
          mode: result.mode,
          usedCompression: result.usedCompression,
          skippedReason: result.usedCompression ? null : result.fallbackReason,
          originalEstimate: result.metrics.originalTokens,
          compressedEstimate: result.metrics.compressedTokens,
          savedTokens: result.metrics.savedTokens,
        }),
      );
    }
  }

  return { ...result, policyDecision: decision };
}
