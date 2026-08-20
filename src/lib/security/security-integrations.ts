/**
 * Integration seams for Security.
 *
 * Each interface names how a neighbouring NeoDevEx system will plug into
 * Security later. None of them are implemented or wired up here — they exist
 * so the eventual engine has a fixed shape to build against, and so nothing
 * has to reach into those systems ad hoc.
 */
import type {
  SecurityFinding,
  SecurityScan,
  SecuritySummary,
} from "./security-types";

/** AgentOps: runs and tracks a scan as governed background work. */
export interface SecurityAgentOpsIntegration {
  requestScan(workspaceId: string, repositoryId: string): Promise<SecurityScan>;
}

/** Workspace Memory: what Security learned about this workspace, remembered. */
export interface SecurityMemoryIntegration {
  recordSummary(summary: SecuritySummary): Promise<void>;
}

/** Proactive Engineering: turn a finding into proactive remediation work. */
export interface SecurityProactiveIntegration {
  proposeRemediation(finding: SecurityFinding): Promise<{ taskId: string }>;
}

/** Knowledge CodeGraph: locate a finding within the repository's structure. */
export interface SecurityCodeGraphIntegration {
  resolveAffectedComponents(
    finding: SecurityFinding,
  ): Promise<{ componentId: string; label: string }[]>;
}

/** NeoDevEx agent runtime: "Fix with Agent" hands a finding to a conversation. */
export interface SecurityAgentRuntimeIntegration {
  startFixConversation(
    finding: SecurityFinding,
  ): Promise<{ conversationId: string }>;
}
