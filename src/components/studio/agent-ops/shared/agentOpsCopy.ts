/** Operational UI copy for Agent Ops (concise, no hype). */
export const AGENT_OPS_COPY = {
  proactiveScope: "Internal candidates only. No PR opens until you approve.",
  proactiveScopeShort: "Internal only · PR after approval",

  runsIdle: "Runs idle",
  runsInProgress: "Runs in progress",
  awaitingReview: "Awaiting review",
  candidatesReady: "Candidates ready",
  noCandidatesReady: "None ready",
  candidatesReadyDetail: "Approve in-app before any PR opens.",

  loadingCandidates: "Loading candidates.",
  proactivePausedTitle: "Proactive off",
  proactivePausedMessage: "Enable proactive in the sidebar to queue internal candidates.",
  noCandidatesTitle: "No candidates",
  noCandidatesMessage: "Run scan to fill the board. PRs stay closed until you approve.",

  noRunSelectedTitle: "No run selected",
  noRunSelectedMessage: "Pick a run from the queue or start one under New run.",
  noRunsTitle: "No runs",
  noRunsMessage: "Paste a GitHub issue URL under New run.",
  issueUrlHint: "GitHub issue URL for this repo.",
  githubOnly: "Requires a GitHub repository.",

  noCandidateSelectedTitle: "No candidate selected",
  noCandidateSelectedMessage: "Select a candidate to view evidence, linked run, and gates.",

  evidenceEmpty: "No evidence yet.",
  linkedRunEmpty: "Run attaches when this candidate is materialized.",
  filesPending: "File list pending — run may still be active.",
  filesNeedRun: "Link a run to list changed files.",
  validationOnRun: "Validation lives on the linked run.",
  gatesPending: "Gates appear after validation completes.",

  liveConsoleEmpty: "No stored events for this selection.",

  prDraftPending: "Draft appears when the run reaches review.",
  prDraftNeedsApproval: "Approve the run to build a PR draft.",
  prApproveNote: "Approve to open a PR. Nothing is public until then.",

  validationNotRun: "Validation not started.",
  validationNoOutput: "No command output stored.",
  noTestMatrix: "No test matrix for this run.",
  noQualityGates: "No gate results for this run.",

  reviewerBriefNote: "Scene brief. PR title and body are on the PR tab.",

  approvePolicyWarning: "Sensitive paths — review only, no auto PR.",
  approvePolicyBlocked: "Policy blocks PR approval.",

  refresh: "Refresh",
} as const;
