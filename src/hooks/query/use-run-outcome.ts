import { useQuery } from "@tanstack/react-query";
import EventService from "#/api/event-service/event-service.api";
import { useActiveBackend } from "#/contexts/active-backend-context";
import {
  latestRunError,
  latestRunReport,
  parseRunOutcome,
  type RunErrorKind,
  type RunOutcome,
} from "#/lib/automation/delivery-contract";
import { AutomationRunStatus, type AutomationRun } from "#/types/automation";

export const RUN_OUTCOME_QUERY_KEY = ["automation-run-outcome"] as const;

// The closing message is the newest event or close to it; a few state-update
// events can follow it.
const REPORT_SEARCH_LIMIT = 10;

// Matches the bridge's recovery window (RECOVERY_WINDOW_MS).
const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

function isRecoverable(run: AutomationRun): boolean {
  if (run.status !== AutomationRunStatus.FAILED || !run.completed_at) {
    return false;
  }
  return Date.now() - new Date(run.completed_at).getTime() < RECOVERY_WINDOW_MS;
}

export interface RunReport {
  /** The run's final agent message, without its RESULT line. */
  text: string | null;
  outcome: RunOutcome;
  /** Why the conversation ended in error, when it did. */
  error: { summary: string; kind: RunErrorKind } | null;
}

const RESULT_LINE = /^\s*RESULT:.*$/gim;

/**
 * A finished run's final report and what it delivered, read from its
 * conversation's closing agent message rather than from the run status. The
 * status alone misleads both ways: a run that printed a fake `/pull/new/`
 * link was COMPLETED, and a run that hit a transient LLM error and was then
 * resumed to a delivered PR stays FAILED because the automation service never
 * reopens a run.
 *
 * Benchmarked against Devin, whose run list shows each session's summary:
 * here the report sits on the run row, so nobody has to open the
 * conversation to learn what a run did.
 *
 * Returns null while unknown or when the run has no conversation.
 */
export function useRunReport(run: AutomationRun): RunReport | null {
  const active = useActiveBackend();
  const isTerminal =
    run.status === AutomationRunStatus.COMPLETED ||
    run.status === AutomationRunStatus.FAILED;
  const conversationId = run.conversation_id;

  const { data } = useQuery({
    queryKey: [
      ...RUN_OUTCOME_QUERY_KEY,
      run.id,
      conversationId,
      active.backend.id,
      active.backend.connectionRevision ?? 0,
    ],
    enabled: isTerminal && !!conversationId,
    queryFn: async (): Promise<RunReport> => {
      const page = await EventService.searchEvents(
        conversationId!,
        null,
        null,
        {
          limit: REPORT_SEARCH_LIMIT,
          sortOrder: "TIMESTAMP_DESC",
        },
      );
      const items = Array.isArray(page.items) ? page.items : [];
      const report = latestRunReport(items);
      return {
        text: report?.replace(RESULT_LINE, "").trim() || null,
        outcome: parseRunOutcome(report),
        error: latestRunError(items),
      };
    },
    staleTime: 60 * 1000,
    // A recently FAILED run may still be recovered: the GitHub event bridge
    // resumes its conversation after a transient LLM error.
    refetchInterval: isRecoverable(run) ? 30_000 : false,
  });

  return data ?? null;
}
