import type { ErrorClassification } from "@openhands/typescript-client";
import { I18nKey } from "#/i18n/declaration";

/**
 * Maps an AgentErrorEvent's `classification.kind` (the SDK's closed
 * `FailureKind` vocabulary: auth/quota/rate_limit/config/transient/
 * agent_action/internal/unknown) to a plain-English header key, mirroring
 * `getAcpErrorHeaderKey` in `acp-error-codes.ts` for ConversationErrorEvent's
 * `code`. `quota` and `rate_limit` share the same header as the ACP/LLM
 * rate-limit code does; kinds with no dedicated copy fall back to the
 * generic "Agent error" header (the raw detail is still shown on expand).
 */
const AGENT_ERROR_HEADER_KEYS: Partial<
  Record<ErrorClassification["kind"], I18nKey>
> = {
  auth: I18nKey.ERROR$ACP_AUTH_REQUIRED_TITLE,
  quota: I18nKey.ERROR$LLM_RATE_LIMITED_TITLE,
  rate_limit: I18nKey.ERROR$LLM_RATE_LIMITED_TITLE,
  transient: I18nKey.ERROR$LLM_UNAVAILABLE_TITLE,
};

/** Localized header key for an AgentErrorEvent's classification. */
export function getAgentErrorHeaderKey(
  classification?: ErrorClassification | null,
): I18nKey {
  if (!classification) return I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE;
  return (
    AGENT_ERROR_HEADER_KEYS[classification.kind] ??
    I18nKey.CHAT_INTERFACE$AGENT_ERROR_MESSAGE
  );
}
