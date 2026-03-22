import { API_URL } from "@/env";

export type AgentRunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "validating"
  | "awaiting_review"
  | "approved"
  | "rejected"
  | "failed"
  | "expired"
  | "cancelled";

export interface AgentRunContextHints {
  focusFiles: string[];
  hubFiles: string[];
  entryFiles: string[];
  technologies: string[];
  architecture?: string | null;
  evidenceCount?: number | null;
  snippetCount?: number | null;
}

export interface AgentRunIssue {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  state?: string | null;
  labels: string[];
  author?: string | null;
  htmlUrl: string;
  comments: Array<{
    author: string;
    body: string;
  }>;
}

export interface AgentRunPlan {
  summary: string;
  strategy: string;
  tasks: Array<{
    title: string;
    detail: string;
  }>;
  risks: string[];
  validation_focus: string[];
}

export interface AgentRunTimelineEvent {
  id: string;
  at: string;
  kind: string;
  title: string;
  detail: string;
  level: "info" | "error" | "warning";
}

export interface AgentRunCommandResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  kind?: "install" | "validation";
}

export interface AgentRunValidation {
  overallStatus: "passed" | "partial" | "failed" | "not_run";
  commands: AgentRunCommandResult[];
  mode?: "standard" | "diff_only";
  notes?: string[];
}

export interface AgentRunChangedFile {
  path: string;
  additions: number;
  deletions: number;
  changedLines: number;
  sensitive: boolean;
}

export interface AgentRunPrDraft {
  title: string;
  body: string;
}

export interface PrReadableSection {
  heading: string;
  body: string;
  kind: "summary" | "strategy" | "changes" | "validation" | "risk" | "confidence" | "checklist" | "notes";
}

export interface PrReadable {
  title: string;
  sections: PrReadableSection[];
  checklist: Array<{ label: string; checked: boolean }>;
  reviewerPrompts: string[];
}

export interface TestMatrixEntry {
  suite: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "timeout";
  durationMs: number;
  exitCode: number;
  failureSummary?: string | null;
  impactedFiles: string[];
  logRef?: string | null;
}

export interface TestMatrix {
  suites: TestMatrixEntry[];
  overallStatus: "passed" | "partial" | "failed" | "not_run";
  totalDurationMs: number;
  passRate: number;
}

export interface QualityGateEntry {
  gate: "lint" | "test" | "build" | "typecheck" | "security" | "diff_check";
  status: "passed" | "failed" | "skipped" | "not_run";
  detail?: string | null;
}

export interface QualityGates {
  gates: QualityGateEntry[];
  allPassed: boolean;
  recommendation: "ship" | "review" | "rework";
}

export interface ChangeIntent {
  issueTitle: string;
  issueNumber: number | null;
  planSummary: string;
  hypothesis: string;
  selfCritique: string;
  taskBreakdown: Array<{
    title: string;
    detail: string;
    status: "done" | "partial" | "skipped";
    acceptanceMet: boolean;
  }>;
  blastRadius: string[];
  evidenceSufficiency: "strong" | "moderate" | "weak";
}

export interface RunMetrics {
  totalTokensUsed: number;
  planningAttempts: number;
  patchAttempts: number;
  critiqueIterations: number;
  validationDepth: number;
  artifactConfidence: number;
}

export interface AgentRunEvaluation {
  riskLevel: "low" | "medium" | "high";
  riskScore: number;
  riskReasons: string[];
  confidenceLevel: "low" | "medium" | "high";
  confidenceScore: number;
  confidenceReasons: string[];
}

export interface AgentRun {
  id: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  projectId?: string | null;
  repoUrl: string;
  repoName: string;
  issueUrl: string;
  branch?: string | null;
  issue?: AgentRunIssue | null;
  contextHints?: AgentRunContextHints | null;
  plan?: AgentRunPlan | null;
  timeline: AgentRunTimelineEvent[];
  policy: {
    commandAllowlist: string[];
    pathDenylist: string[];
    networkPolicy: string;
  };
  control: {
    cancelRequested: boolean;
  };
  artifacts: {
    workspacePath?: string | null;
    patch: string;
    diffStat: string;
    changedFiles: AgentRunChangedFile[];
    validation: AgentRunValidation;
    prDraft?: AgentRunPrDraft | null;
    prReadable?: PrReadable | null;
    testMatrix?: TestMatrix | null;
    qualityGates?: QualityGates | null;
    changeIntent?: ChangeIntent | null;
    artifactPaths: Record<string, string>;
    failureCategory?: string | null;
  };
  evaluation: AgentRunEvaluation;
  metrics?: RunMetrics | null;
  approval: {
    status: "pending" | "approved" | "rejected";
    branchName?: string | null;
    instructions: string[];
    approvedAt?: string | null;
    rejectedAt?: string | null;
    prUrl?: string | null;
    commitSha?: string | null;
    promotionLog: string[];
  };
}

export interface CreateAgentRunRequest {
  repoUrl: string;
  repoName: string;
  issueUrl: string;
  projectId?: string | null;
  branch?: string | null;
  githubToken?: string | null;
  contextHints?: AgentRunContextHints | null;
}

const resolveApiPath = (path: string) =>
  API_URL === "/api" ? `/api${path}` : `${API_URL}/api${path}`;

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveApiPath(path), {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  const raw = await response.text();
  let payload: unknown = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { detail: raw };
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === "object"
        ? (payload as { detail?: unknown; error?: unknown })
        : {};
    const nestedDetail =
      errorPayload.detail && typeof errorPayload.detail === "object"
        ? (errorPayload.detail as { detail?: unknown; error?: unknown })
        : {};
    const detail =
      nestedDetail.detail ||
      nestedDetail.error ||
      errorPayload.detail ||
      errorPayload.error ||
      `Request failed with status ${response.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return payload as T;
}

export async function listAgentRuns(params: {
  repoUrl?: string | null;
  projectId?: string | null;
  limit?: number;
}): Promise<AgentRun[]> {
  const search = new URLSearchParams();
  if (params.repoUrl) search.set("repoUrl", params.repoUrl);
  if (params.projectId) search.set("projectId", params.projectId);
  if (params.limit) search.set("limit", String(params.limit));
  const suffix = search.toString() ? `?${search}` : "";
  const payload = await requestJson<{ runs: AgentRun[] }>(`/agent-runs${suffix}`);
  return payload.runs || [];
}

export async function getAgentRun(runId: string): Promise<AgentRun> {
  const payload = await requestJson<{ run: AgentRun }>(`/agent-runs/${runId}`);
  return payload.run;
}

export async function createAgentRun(input: CreateAgentRunRequest): Promise<AgentRun> {
  const payload = await requestJson<{ run: AgentRun }>(`/agent-runs`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return payload.run;
}

export async function approveAgentRun(runId: string, branchName?: string): Promise<AgentRun> {
  const payload = await requestJson<{ run: AgentRun }>(`/agent-runs/${runId}/approve`, {
    method: "POST",
    body: JSON.stringify({ branchName }),
  });
  return payload.run;
}

export async function rejectAgentRun(runId: string): Promise<AgentRun> {
  const payload = await requestJson<{ run: AgentRun }>(`/agent-runs/${runId}/reject`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return payload.run;
}

export async function cancelAgentRun(runId: string): Promise<AgentRun> {
  const payload = await requestJson<{ run: AgentRun }>(`/agent-runs/${runId}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return payload.run;
}
