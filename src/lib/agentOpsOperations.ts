export type RunsOperationInput = {
  loadingRuns: boolean;
  syncingRuns: boolean;
  refreshing: boolean;
  submitting: boolean;
  action: "approve" | "reject" | "cancel" | "retry" | null;
  pollingActive: boolean;
};

export type ProactiveOperationInput = {
  loading: boolean;
  syncing: boolean;
  action: string | null;
};

export type AgentOpsOperationDescriptor = {
  id: string;
  label: string;
  tone: "neutral" | "active" | "mutate";
};

export function resolveRunsOperation(input: RunsOperationInput): AgentOpsOperationDescriptor | null {
  if (input.action === "approve") {
    return { id: "approve", label: "Approving run…", tone: "mutate" };
  }
  if (input.action === "reject") {
    return { id: "reject", label: "Rejecting run…", tone: "mutate" };
  }
  if (input.action === "cancel") {
    return { id: "cancel", label: "Cancelling run…", tone: "mutate" };
  }
  if (input.action === "retry") {
    return { id: "retry", label: "Retrying run…", tone: "mutate" };
  }
  if (input.submitting) {
    return { id: "start_run", label: "Starting run…", tone: "mutate" };
  }
  if (input.refreshing) {
    return { id: "refresh_run", label: "Refreshing run…", tone: "mutate" };
  }
  if (input.loadingRuns) {
    return { id: "load_runs", label: "Loading runs…", tone: "neutral" };
  }
  return null;
}

export function resolveProactiveOperation(input: ProactiveOperationInput): AgentOpsOperationDescriptor | null {
  if (input.action === "dispatch") {
    return { id: "dispatch", label: "Dispatching proactive scan…", tone: "mutate" };
  }
  if (input.action === "toggle") {
    return { id: "toggle", label: "Saving proactive settings…", tone: "mutate" };
  }
  if (input.action?.startsWith("approve:")) {
    return { id: "approve_candidate", label: "Approving candidate…", tone: "mutate" };
  }
  if (input.action?.startsWith("dismiss:")) {
    return { id: "dismiss_candidate", label: "Dismissing candidate…", tone: "mutate" };
  }
  if (input.loading) {
    return { id: "load_proactive", label: "Loading proactive…", tone: "neutral" };
  }
  return null;
}

export function proactiveActionButtonLabel(
  action: string | null,
  kind: "refresh" | "dispatch" | "approve" | "dismiss",
  defaults: { idle: string; busy: string },
) {
  if (kind === "refresh" && action !== "dispatch") {
    return defaults.idle;
  }
  if (kind === "dispatch" && action === "dispatch") {
    return defaults.busy;
  }
  if (kind === "approve" && action?.startsWith("approve:")) {
    return defaults.busy;
  }
  if (kind === "dismiss" && action?.startsWith("dismiss:")) {
    return defaults.busy;
  }
  return defaults.idle;
}
