import {
  openExistingAnalysis,
  runAnalysis,
  type AnalysisHandle,
} from "#/lib/codegraph/analyzer-runner";
import { toSubsystemHints } from "#/lib/codegraph/deepwiki-bridge";
import { workspaceIdForSnapshot } from "#/lib/codegraph/workspace-identity";
import {
  buildEvidenceSummary,
  buildEvidenceSubsystemIndex,
  type CodeEvidenceSummary,
  type EvidenceSubsystemEntry,
} from "./code-evidence";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "./knowledge-engine";

export interface EvidencePass {
  handle: AnalysisHandle;
  summary: CodeEvidenceSummary;
  subsystems: EvidenceSubsystemEntry[];
}

/**
 * Best-effort: reuses an existing CodeGraph analysis for this exact commit
 * if one is already cached, otherwise runs a bounded analyzer pass. Never
 * blocks or fails Knowledge generation — any analyzer error or timeout
 * resolves to `null`, and structure determination falls back to file_tree +
 * README only, exactly as it did before this evidence pipeline existed.
 */
export async function ensureCodeEvidence(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
): Promise<EvidencePass | null> {
  const workspaceId = workspaceIdForSnapshot(snapshot);
  // No real Supabase ids resolved here -- this is a best-effort internal
  // evidence pass, not the user-facing CodeGraph tab, so it always goes
  // through the sandbox rather than the Storage mirror.
  const shared = {
    snapshot,
    conversationUrl,
    sessionApiKey,
    workspaceId,
    storageIds: null,
  };
  try {
    const handle =
      (await openExistingAnalysis(shared)) ??
      (await runAnalysis({ ...shared, hints: [], timeoutSeconds: 120 }));
    if (!handle) return null;
    return {
      handle,
      summary: buildEvidenceSummary(handle),
      subsystems: buildEvidenceSubsystemIndex(handle),
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget: once real Knowledge exists, re-runs analysis with real
 * `SubsystemHint`s so a later CodeGraph visit finds better-named subsystems
 * without the user manually re-analyzing. Errors are swallowed — this is a
 * naming-quality improvement, not a correctness path.
 */
export function upgradeCodeEvidenceInBackground(
  snapshot: RepositorySnapshot,
  conversationUrl: string | null,
  sessionApiKey: string | null,
  knowledge: KnowledgeRepository,
): void {
  const workspaceId = workspaceIdForSnapshot(snapshot);
  void runAnalysis({
    snapshot,
    conversationUrl,
    sessionApiKey,
    workspaceId,
    hints: toSubsystemHints(knowledge),
    storageIds: null,
  }).catch(() => {});
}
