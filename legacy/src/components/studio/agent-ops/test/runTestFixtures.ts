import type { AgentRun } from "@/lib/agentRuns";

export function makeAgentRunFixture(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    id: "run-test-1",
    status: "awaiting_review",
    createdAt: "2026-05-27T12:00:00.000Z",
    updatedAt: "2026-05-27T12:30:00.000Z",
    repoUrl: "https://github.com/o/r",
    repoName: "o/r",
    issueUrl: "https://github.com/o/r/issues/1",
    timeline: [],
    policy: { commandAllowlist: [], pathDenylist: [], networkPolicy: "deny" },
    control: { cancelRequested: false },
    artifacts: {
      patch: "",
      diffStat: "",
      changedFiles: [{ path: "src/a.ts", additions: 1, deletions: 0, changedLines: 1, sensitive: false }],
      validation: { overallStatus: "passed", commands: [] },
      artifactPaths: {},
    },
    evaluation: {
      riskLevel: "low",
      riskScore: 0.2,
      riskReasons: [],
      confidenceLevel: "high",
      confidenceScore: 0.9,
      confidenceReasons: [],
    },
    approval: { branchName: "fix/test", instructions: [], prUrl: null },
    ...overrides,
  };
}
