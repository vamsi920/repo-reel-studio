import type { ProactiveCandidate, ProactiveStatus } from "@/lib/proactiveAgentOps";

export type ProactiveEventSource = "batch" | "candidate" | "run";

export type ProactiveTimelineRow = {
  id: string;
  at?: string | null;
  source: ProactiveEventSource;
  stage: string;
  title: string;
  detail?: string | null;
  snippet?: string | null;
  level?: string | null;
  ai?: boolean;
  model?: string | null;
  kind?: "timeline" | "validation";
};

export type ProactiveLiveGroup = {
  source: ProactiveEventSource;
  label: string;
  events: ProactiveTimelineRow[];
};

const GROUP_LABELS: Record<ProactiveEventSource, string> = {
  batch: "Batch",
  candidate: "Candidate",
  run: "Linked run",
};

export function buildProactiveTimelineRows(
  candidate: ProactiveCandidate | null,
  batch: ProactiveStatus["batch"] | null,
): ProactiveTimelineRow[] {
  const rows: ProactiveTimelineRow[] = [];

  batch?.transitions?.forEach((transition, index) => {
    rows.push({
      id: `batch-${batch.id}-transition-${index}`,
      at: transition.at,
      source: "batch",
      stage: transition.status,
      title: transition.status.replace(/_/g, " "),
      detail: transition.detail ?? null,
      level: transition.status === "failed" ? "error" : "info",
      kind: "timeline",
    });
  });

  candidate?.timeline?.forEach((event, index) => {
    rows.push({
      id: `candidate-${candidate.id}-${index}`,
      at: event.at,
      source: "candidate",
      stage: event.stage,
      title: event.title,
      detail: event.detail ?? null,
      level: event.level,
      ai: event.source === "ai" || event.stage.startsWith("ai_"),
      model: event.model,
      kind: "timeline",
    });
  });

  candidate?.linkedRun?.timeline?.forEach((event) => {
    rows.push({
      id: `run-${event.id}`,
      at: event.at,
      source: "run",
      stage: event.kind,
      title: event.title,
      detail: event.detail ?? null,
      level: event.level,
      kind: "timeline",
    });
  });

  return rows.sort((left, right) => {
    const leftTime = Date.parse(left.at || "") || 0;
    const rightTime = Date.parse(right.at || "") || 0;
    return leftTime - rightTime;
  });
}

export function buildValidationCommandRows(candidate: ProactiveCandidate | null): ProactiveTimelineRow[] {
  const linkedRun = candidate?.linkedRun;
  const commands = linkedRun?.validation?.commands ?? [];
  if (!linkedRun || commands.length === 0) return [];

  const anchorAt = linkedRun.updatedAt ?? linkedRun.completedAt ?? linkedRun.startedAt ?? null;

  return commands.map((command, index) => {
    const snippet = validationSnippet(command.stderr, command.stdout);
    return {
      id: `run-validation-${linkedRun.id}-${index}`,
      at: anchorAt,
      source: "run",
      stage: "validation",
      title: command.command,
      detail: snippet,
      snippet,
      level: command.exitCode === 0 ? "info" : "error",
      kind: "validation",
    };
  });
}

export function buildProactiveLiveGroups(
  candidate: ProactiveCandidate | null,
  batch: ProactiveStatus["batch"] | null,
): ProactiveLiveGroup[] {
  const timeline = buildProactiveTimelineRows(candidate, batch);
  const validation = buildValidationCommandRows(candidate);
  const groups: ProactiveLiveGroup[] = [];

  (["batch", "candidate", "run"] as const).forEach((source) => {
    const events = timeline.filter((row) => row.source === source);
    const withValidation = source === "run" ? [...events, ...validation] : events;
    if (withValidation.length > 0) {
      groups.push({ source, label: GROUP_LABELS[source], events: withValidation });
    }
  });

  return groups;
}

function validationSnippet(stderr: string, stdout: string) {
  const line = firstNonEmptyLine(stderr) || firstNonEmptyLine(stdout);
  if (!line) return null;
  return line.length > 96 ? `${line.slice(0, 93)}…` : line;
}

function firstNonEmptyLine(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
}
