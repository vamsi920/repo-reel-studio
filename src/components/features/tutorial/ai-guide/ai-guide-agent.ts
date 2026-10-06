import { supabase } from "#/lib/data-platform/client";
import {
  AiGuideClosedError,
  type AiGuideErrorKind,
  type AiGuideStep,
} from "./ai-guide-store";
import { createGuideTools, redactPageContent } from "./guide-tools";

/** Supabase Edge Function holding the model key (supabase/functions/ai-guide). */
export const AI_GUIDE_FUNCTION_NAME = "ai-guide";
/** Steps the agent may take in one guide; each user action is one step. */
const AI_GUIDE_MAX_STEPS = 30;
/**
 * page-agent requires a base URL and model, but every request goes through
 * `customFetch` to our proxy, which picks the real model server-side.
 */
const PROXIED_BASE_URL = "https://ai-guide.invalid/v1";
const PROXIED_MODEL = "server-selected";

/** Our own tour UI, which the agent must never point at. */
const OWN_UI_SELECTORS = [
  '[data-testid="tutorial-wizard"]',
  '[data-testid="tutorial-launcher"]',
  '[data-testid="tutorial-launch-menu"]',
  '[data-testid="tutorial-spotlight"]',
];

const NOT_INTERACTIVE_ATTRIBUTE = "data-page-agent-not-interactive";

function markOwnUiNotInteractive() {
  for (const root of document.querySelectorAll(OWN_UI_SELECTORS.join(","))) {
    root.setAttribute(NOT_INTERACTIVE_ATTRIBUTE, "");
    for (const element of root.querySelectorAll("*")) {
      element.setAttribute(NOT_INTERACTIVE_ATTRIBUTE, "");
    }
  }
}

export class AiGuideRequestError extends Error {
  constructor(readonly kind: AiGuideErrorKind) {
    super(`AI guide request failed: ${kind}`);
    this.name = "AiGuideRequestError";
  }
}

function errorKindForStatus(status: number): AiGuideErrorKind {
  if (status === 401) return "signed_out";
  if (status === 429) return "rate_limited";
  if (status === 503 || status === 404) return "unavailable";
  return "failed";
}

/**
 * page-agent's `customFetch`: forwards its OpenAI-style request body to the
 * `ai-guide` Edge Function with the signed-in user's session (added by
 * `functions.invoke`) and hands the JSON answer back as a Response.
 */
export async function proxyLlmFetch(
  _url: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!supabase) throw new AiGuideRequestError("unavailable");
  const body =
    typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
  const { data, error } = await supabase.functions.invoke(
    AI_GUIDE_FUNCTION_NAME,
    { body, signal: init?.signal ?? undefined },
  );
  if (error) {
    const status = (error as { context?: Response }).context?.status ?? 0;
    throw new AiGuideRequestError(errorKindForStatus(status));
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildSystemInstructions(appMap: string, language: string) {
  return [
    "You are Neo's in-app guide. You never act on the page yourself: you point at one element at a time and the user does every click and keystroke.",
    "For each step call exactly one guide tool. Titles are 3 to 8 words; tips are one short sentence that says what the element does and why to click it now.",
    "Prefer go_to_page to reach another area quickly, then point at the exact control on that page.",
    "Never ask for, repeat or suggest values for secrets, API keys, passwords or tokens.",
    "When the user has reached the screen where their goal is done, or can finish it alone, call done.",
    `Write titles and tips in the language with code "${language}".`,
    "Pages in this app and what they contain:",
    appMap,
  ].join("\n");
}

export interface AiGuideRunOptions {
  query: string;
  language: string;
  appMap: string;
  allowedRoutes: readonly string[];
  doneTitle: string;
  navigate: (route: string) => void;
  presentStep: (step: AiGuideStep) => Promise<void>;
  advance: () => void;
  setPlanning: () => void;
  /** Lets the caller stop the run (closing the guide). */
  registerStop: (stop: () => void) => void;
}

export type AiGuideRunResult =
  | { outcome: "completed"; steps: number }
  | { outcome: "closed" }
  | { outcome: "error"; kind: AiGuideErrorKind };

/**
 * Runs one AI guide. page-agent is imported only here, lazily, so it never
 * enters the main bundle; it is loaded the first time someone asks for a
 * guide.
 */
export async function runAiGuide(
  options: AiGuideRunOptions,
): Promise<AiGuideRunResult> {
  const [{ PageAgentCore }, { PageController }] = await Promise.all([
    import("@page-agent/core"),
    import("@page-agent/page-controller"),
  ]);

  const pageController = new PageController({
    enableMask: false,
    highlightOpacity: 0,
    highlightLabelOpacity: 0,
  });
  // page-agent re-reads `[data-page-agent-not-interactive]` on every page
  // read, but per element, not per subtree: mark everything inside our own
  // tour UI right before each read so the agent never offers "Skip" or
  // "I did it" as a step.
  pageController.addEventListener("beforeUpdate", markOwnUiNotInteractive);
  // It also always draws numbered debug labels on the page while reading;
  // remove them as soon as the read is done.
  pageController.addEventListener("afterUpdate", () => {
    pageController.cleanUpHighlights();
  });

  let failure: AiGuideErrorKind | null = null;
  const agent = new PageAgentCore({
    pageController,
    baseURL: PROXIED_BASE_URL,
    model: PROXIED_MODEL,
    disableNamedToolChoice: true,
    maxRetries: 1,
    maxSteps: AI_GUIDE_MAX_STEPS,
    stepDelay: 0,
    customFetch: async (url, init) => {
      try {
        return await proxyLlmFetch(url, init);
      } catch (error) {
        if (error instanceof AiGuideRequestError) failure = error.kind;
        throw error;
      }
    },
    customTools: createGuideTools({
      presentStep: options.presentStep,
      advance: options.advance,
      navigate: options.navigate,
      allowedRoutes: options.allowedRoutes,
      doneTitle: options.doneTitle,
    }),
    instructions: {
      system: buildSystemInstructions(options.appMap, options.language),
    },
    transformPageContent: redactPageContent,
    onBeforeStep: () => options.setPlanning(),
  });

  let closed = false;
  options.registerStop(() => {
    closed = true;
    agent.stop().finally(() => agent.dispose());
  });

  try {
    const result = await agent.execute(options.query);
    if (closed) return { outcome: "closed" };
    if (failure) return { outcome: "error", kind: failure };
    if (!result.success) return { outcome: "error", kind: "failed" };
    return { outcome: "completed", steps: agent.history.length };
  } catch (error) {
    if (closed || error instanceof AiGuideClosedError) {
      return { outcome: "closed" };
    }
    return {
      outcome: "error",
      kind: error instanceof AiGuideRequestError ? error.kind : "failed",
    };
  } finally {
    if (!closed) agent.dispose();
  }
}
