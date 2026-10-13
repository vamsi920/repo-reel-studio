/**
 * Delivery contract helpers for the app. The contract text and the prompt
 * helpers live in scripts/automation-delivery-contract.mjs so the GitHub
 * event bridge can apply the same text and the automation guard can read
 * the same run reports.
 *
 * Pure module (no `#/` imports) so benchmark scripts can import it directly.
 */

export {
  AUTOMATION_BRANCH_PREFIX,
  DELIVERY_CONTRACT,
  DELIVERY_CONTRACT_MARKER,
  hasDeliveryContract,
  latestRunError,
  latestRunReport,
  parseRunOutcome,
  withDeliveryContract,
  withoutDeliveryContract,
} from "../../../scripts/automation-delivery-contract.mjs";

export type RunOutcome =
  | { kind: "delivered"; url: string }
  | { kind: "failed"; reason: string }
  | { kind: "unreported" };

export type RunErrorKind =
  | "llm_auth"
  | "llm_quota"
  | "context_window"
  | "budget"
  | "other";
