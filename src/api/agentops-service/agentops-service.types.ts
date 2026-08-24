/**
 * Wire types for the Neo AgentOps Control Tower collector
 * (`scripts/agentops-server.mjs`).
 *
 * The collector owns these shapes; this file is the client-side mirror. Span
 * attribute *keys* are the AgentOps semantic conventions vendored at
 * `vendor/agentops/semconv/` — see `THIRD_PARTY_NOTICES.md`. Attributes are
 * typed as an open record on purpose: the UI renders whatever the collector
 * emitted rather than hard-coding a closed list, so a new attribute shows up
 * in the span inspector without a frontend change.
 */

/** Mirrors the agent-server's `ConversationExecutionStatus`. */
export type AgentOpsRunStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "finished"
  | "error"
  | "stuck";

export type AgentOpsRunPhase =
  | "planning"
  | "repository_inspection"
  | "tool_call"
  | "code_edit"
  | "tests"
  | "review"
  | "waiting_approval"
  | "completed";

export interface AgentOpsTokens {
  prompt: number;
  completion: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning: number;
  total: number;
}

export interface AgentOpsRun {
  runId: string;
  /** Agent-server workspace `working_dir`. */
  workspaceId: string;
  agentName: string;
  task: string;
  status: AgentOpsRunStatus;
  model: string | null;
  phase: AgentOpsRunPhase;
  startedAt: string;
  endedAt: string | null;
  updatedAt: string;
  /**
   * Real accumulated cost reported by the runtime. `0` can mean "the provider
   * reported no cost", which is why the summary counts those runs separately
   * instead of presenting them as free.
   */
  costUsd: number;
  maxBudgetPerTask: number | null;
  tokens: AgentOpsTokens;
  toolCallCount: number;
  llmCallCount: number;
  errorCount: number;
  artifacts: string[];
}

export interface AgentOpsSpan {
  spanId: string;
  parentSpanId: string | null;
  traceId: string;
  kind: "tool" | "llm" | "agent" | "session" | string;
  name: string;
  phase: AgentOpsRunPhase;
  startTime: string;
  endTime: string | null;
  status: string;
  attributes: Record<string, unknown>;
}

export interface AgentOpsAuditRecord {
  id: string;
  at: string;
  actor: "user" | "agent" | "system";
  action: string;
  summary: string;
  entityType: string;
  entityId: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentOpsBudgetBreach {
  scope: "run" | "agent" | "workspace";
  limitUsd: number;
  usedUsd: number;
  message: string;
}

export interface AgentOpsApproval {
  id: string;
  /**
   * `confirmation` mirrors the runtime's own blocking confirmation wait — the
   * agent is genuinely stopped until it is answered. `budget` is raised by the
   * collector after it halted a run for exceeding a limit.
   */
  kind: "confirmation" | "budget";
  state: "pending" | "approved" | "rejected";
  runId: string;
  workspaceId: string;
  agentName: string;
  title: string;
  what: Record<string, unknown> | string | null;
  why: string;
  toolName?: string | null;
  securityRisk?: string | null;
  artifacts?: string[];
  estimatedCostUsd: number;
  autonomyLevel?: AgentOpsAutonomyLevel;
  breaches?: AgentOpsBudgetBreach[];
  requestedAt: string;
  decidedAt?: string;
  decisionReason?: string | null;
}

export type AgentOpsAutonomyLevel = "supervised" | "assisted" | "autonomous";

export interface AgentOpsWorkspacePolicy {
  workspaceId?: string;
  monthlyBudgetUsd: number | null;
  runBudgetUsd: number | null;
  agentBudgetUsd: number | null;
  warnThresholdPct: number[];
  /** `null` means every tool is allowed. */
  allowedTools: string[] | null;
  autonomyLevel: AgentOpsAutonomyLevel;
  approvalThresholds: { securityRisk: string; costUsd: number | null };
}

export interface AgentOpsPolicies {
  workspaces: Record<string, Partial<AgentOpsWorkspacePolicy>>;
  agents: Record<string, { agentBudgetUsd?: number | null }>;
}

export interface AgentOpsBudget {
  workspaceId: string;
  policy: AgentOpsWorkspacePolicy;
  periodStart: string;
  usedUsd: number;
  remainingUsd: number | null;
  /**
   * Straight-line run-rate extrapolation of this month's real spend. Null
   * until an hour of the month has elapsed. Not a forecast, not a bill.
   */
  projectedUsd: number | null;
  runCount: number;
  runsWithoutReportedCost: number;
  tokens: number;
}

export interface AgentOpsCollectorHealth {
  status: string;
  lastTickAt: string | null;
  lastError: string | null;
  trackedRuns: number;
}

export interface AgentOpsSummary {
  activeAgents: number;
  activeRuns: number;
  runsToday: number;
  waitingForApproval: number;
  failures: number;
  tokensToday: number;
  costTodayUsd: number;
  runsTodayWithoutReportedCost: number;
  generatedAt: string;
  collector: AgentOpsCollectorHealth;
}

export interface AgentOpsRunDetail {
  run: AgentOpsRun;
  spans: AgentOpsSpan[];
  audit: AgentOpsAuditRecord[];
  approvals: AgentOpsApproval[];
}

export type AgentOpsRunControl = "pause" | "resume" | "cancel";
