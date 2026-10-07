import { z } from "zod";
import { findTutorialAnchor } from "../tutorial-spotlight";
import type { AiGuideRunResult } from "./ai-guide-agent";
import { AiGuideRequestError, invokeAiGuide } from "./ai-guide-proxy";
import { AiGuideClosedError, type AiGuideStep } from "./ai-guide-store";
import { completeOnUserAction, isVisibleTarget, waitFor } from "./guide-dom";
import type { UiMapEntry } from "./ui-map";

/** Edge-function mode that answers with a whole plan as JSON (no tools). */
export const PLAN_GUIDE_MODE = "plan_guide";
/** Longest plan we accept; the prompt asks for about 6. */
const MAX_PLANNED_STEPS = 8;
/**
 * How long a planned control may take to appear (a lazy page or a dialog
 * opening) before the step is handed to the live agent. Wall-clock, so a
 * throttled background tab doesn't stretch it.
 */
const LOCATE_TIMEOUT_MS = 2500;
const LOCATE_POLL_MS = 100;

const plannedStepSchema = z.object({
  uiId: z.string().optional(),
  kind: z.enum(["click", "type", "explain"]),
  title: z.string().min(3),
  tip: z.string().min(12),
});

const planSchema = z.object({
  steps: z.array(plannedStepSchema).min(1).max(MAX_PLANNED_STEPS),
  done: z.object({ title: z.string().optional(), tip: z.string().min(1) }),
});

export type GuidePlan = z.infer<typeof planSchema>;
export type PlannedStep = z.infer<typeof plannedStepSchema>;

function describeEntry(entry: UiMapEntry) {
  const where = entry.inDialogOf
    ? `${entry.route}, inside the dialog opened by ${entry.inDialogOf}`
    : entry.route;
  return `- ${entry.id} [${where}]: ${entry.label}. ${entry.purpose}`;
}

export function buildPlanMessages(options: {
  query: string;
  language: string;
  uiMap: readonly UiMapEntry[];
  currentPath: string;
}) {
  const system = [
    "You are Neo's in-app guide. Plan the shortest path of clicks that gets the user to their goal in this app. The user does every click and keystroke themselves.",
    'Answer with JSON only: {"steps":[{"uiId":"<id from the list>","kind":"click"|"type"|"explain","title":"3 to 8 words","tip":"one short sentence: what this does and why now"}],"done":{"title":"short","tip":"one or two sentences on what to check or do next"}}.',
    "The plan is written before the user acts, so the done message must not claim anything was created, saved or changed; say what they should see if it worked instead.",
    'Use only uiIds from the list below. A control inside a dialog needs the step that opens that dialog first. Use kind "type" for text fields and "explain" (no uiId) only for context that has no control.',
    "Keep it short: about 6 steps. On a form, point only at the one or two fields that matter most, then its main button.",
    "Never ask for, repeat or suggest values for secrets, API keys, passwords or tokens.",
    `The user is on ${options.currentPath}. Skip steps they don't need from there.`,
    `Write titles and tips in the language with code "${options.language}".`,
    "Controls in this app:",
    ...options.uiMap.map(describeEntry),
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: options.query },
  ];
}

/** Pulls the JSON object out of a model reply, tolerating code fences. */
function extractJson(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Checks a model reply against the schema and the UI map. Steps naming an
 * unknown control are dropped; returns null when nothing usable is left, so
 * the caller falls back to the live guide.
 */
export function parseGuidePlan(
  content: string,
  uiIds: ReadonlySet<string>,
): GuidePlan | null {
  const parsed = planSchema.safeParse(extractJson(content));
  if (!parsed.success) return null;
  const steps = parsed.data.steps.filter((step) =>
    step.kind === "explain" ? true : !!step.uiId && uiIds.has(step.uiId),
  );
  return steps.length ? { ...parsed.data, steps } : null;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null } }[];
}

export async function requestGuidePlan(
  options: Parameters<typeof buildPlanMessages>[0],
  signal?: AbortSignal,
): Promise<GuidePlan | null> {
  const reply = await invokeAiGuide<ChatCompletion>(
    { mode: PLAN_GUIDE_MODE, messages: buildPlanMessages(options) },
    signal,
  );
  const content = reply?.choices?.[0]?.message?.content ?? "";
  return parseGuidePlan(
    content,
    new Set(options.uiMap.map((entry) => entry.id)),
  );
}

function findVisible(entry: UiMapEntry): HTMLElement | null {
  const element = findTutorialAnchor(entry.testIds);
  return element && isVisibleTarget(element) ? element : null;
}

function isOnRoute(route: string) {
  const path = window.location.pathname;
  return path === route || path.startsWith(`${route}/`);
}

/**
 * Finds a planned control: right away if it's on screen (sidebar links are
 * everywhere), otherwise after opening its page, polling until it renders.
 */
async function locate(
  entry: UiMapEntry,
  options: Pick<PlannedGuideOptions, "navigate" | "allowedRoutes">,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  const found = findVisible(entry);
  if (found) return found;
  if (
    !entry.inDialogOf &&
    !isOnRoute(entry.route) &&
    options.allowedRoutes.includes(entry.route)
  ) {
    options.navigate(entry.route);
  }
  const deadline = Date.now() + LOCATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await waitFor(LOCATE_POLL_MS, signal);
    const element = findVisible(entry);
    if (element) return element;
  }
  return null;
}

export interface PlannedGuideOptions {
  query: string;
  language: string;
  uiMap: readonly UiMapEntry[];
  allowedRoutes: readonly string[];
  doneTitle: string;
  navigate: (route: string) => void;
  presentStep: (step: AiGuideStep) => Promise<void>;
  advance: () => void;
  setPlanning: () => void;
  registerStop: (stop: () => void) => void;
  /** The page-reading agent, for whatever the plan can't cover. */
  runLive: (query: string) => Promise<AiGuideRunResult>;
}

function liveQuery(query: string, done: PlannedStep[], next: PlannedStep) {
  const history = done.map((step) => `- ${step.title}`).join("\n");
  return [
    query,
    history ? `The user has already done these steps:\n${history}` : "",
    `Continue the guide from the current page. The next step was meant to be "${next.title}" (${next.tip}), but that control isn't on screen.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Plan-first guide: one AI call plans every step up front, so after the
 * first one each step appears the moment the user finishes the previous one
 * (no model round trip in between). When a planned control isn't on screen
 * the rest is handed to the live page-reading agent.
 */
export async function runPlannedGuide(
  options: PlannedGuideOptions,
): Promise<AiGuideRunResult> {
  const controller = new AbortController();
  options.registerStop(() => controller.abort(new AiGuideClosedError()));
  const { signal } = controller;
  const entries = new Map(options.uiMap.map((entry) => [entry.id, entry]));

  try {
    options.setPlanning();
    let plan: GuidePlan | null;
    try {
      plan = await requestGuidePlan(
        {
          query: options.query,
          language: options.language,
          uiMap: options.uiMap,
          currentPath: window.location.pathname,
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted) return { outcome: "closed" };
      if (error instanceof AiGuideRequestError && error.kind !== "failed") {
        return { outcome: "error", kind: error.kind };
      }
      plan = null;
    }
    if (signal.aborted) return { outcome: "closed" };
    if (!plan) return await options.runLive(options.query);

    const completed: PlannedStep[] = [];
    for (const step of plan.steps) {
      const entry = step.uiId ? entries.get(step.uiId) : undefined;
      if (step.kind === "explain" || !entry) {
        await options.presentStep({ ...step, element: null });
      } else {
        const element = await locate(entry, options, signal);
        if (!element) {
          return await options.runLive(
            liveQuery(options.query, completed, step),
          );
        }
        const stopListening = completeOnUserAction(
          element,
          step.kind,
          options.advance,
        );
        try {
          await options.presentStep({ ...step, element });
        } finally {
          stopListening();
        }
      }
      completed.push(step);
    }

    await options.presentStep({
      kind: "done",
      title: plan.done.title || options.doneTitle,
      tip: plan.done.tip,
      element: null,
    });
    return { outcome: "completed", steps: completed.length + 1 };
  } catch (error) {
    if (signal.aborted || error instanceof AiGuideClosedError) {
      return { outcome: "closed" };
    }
    return { outcome: "error", kind: "failed" };
  }
}
