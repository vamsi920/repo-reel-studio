import { z } from "zod";
import { tool, type PageAgentTool } from "@page-agent/core";
import { getElementByIndex } from "@page-agent/page-controller";
import type { AiGuideStep } from "./ai-guide-store";
import {
  completeOnUserAction,
  isVisibleTarget,
  linkTargetPath,
  settleAfterAction,
  SETTLE_AFTER_ACTION_MS,
  waitFor,
} from "./guide-dom";

/**
 * Everything the guide tools need from the outside world, injected so the
 * tools stay testable without React or a router.
 */
export interface GuideToolsBridge {
  presentStep: (step: AiGuideStep) => Promise<void>;
  /** The user completed the current step (clicked or typed in the target). */
  advance: () => void;
  navigate: (route: string) => void;
  allowedRoutes: readonly string[];
  /** Fallback title for the closing bubble when the model gives none. */
  doneTitle: string;
}

/**
 * page-agent keeps the index -> element map as a private field of its
 * PageController (the same one its own click tool uses). Reading it here is
 * deliberate and the package version is pinned exactly for that reason; a
 * test covers the lookup so an upgrade that moves it fails loudly.
 */
export function resolveIndexedElement(
  pageController: unknown,
  index: number,
): HTMLElement | null {
  const selectorMap = (
    pageController as { selectorMap?: Map<number, unknown> } | null
  )?.selectorMap;
  if (!(selectorMap instanceof Map)) return null;
  try {
    return getElementByIndex(
      selectorMap as Parameters<typeof getElementByIndex>[0],
      index,
    );
  } catch {
    return null;
  }
}

const pointerSchema = z.object({
  index: z.int().min(0),
  title: z.string(),
  tip: z.string(),
});

const explainSchema = z.object({ title: z.string(), tip: z.string() });

/** Shortest tip worth showing; anything less reads as an empty bubble. */
const MIN_TIP_CHARS = 12;
const MIN_TITLE_CHARS = 3;

/**
 * Why a step can't be shown as written, or null if it can. Returned to the
 * agent as the tool result so it corrects itself on its next step, instead
 * of the user seeing a blank bubble or a ring around nothing.
 */
function rejectCopy(title: string, tip: string): string | null {
  if (
    title.trim().length < MIN_TITLE_CHARS ||
    tip.trim().length < MIN_TIP_CHARS
  ) {
    return "Rejected: every step needs a short title and a one-sentence tip that says what this does and why. Call the tool again with both.";
  }
  return null;
}

/**
 * Tool set for "guide mode": page-agent's tools that act on the page are
 * removed, so the agent can only point at elements and explain them while
 * the user does every click and keystroke themselves.
 */
export function createGuideTools(
  bridge: GuideToolsBridge,
): Record<string, PageAgentTool | null> {
  async function pointAt(
    controller: unknown,
    kind: "click" | "type",
    input: z.infer<typeof pointerSchema>,
    signal: AbortSignal,
  ) {
    const badCopy = rejectCopy(input.title, input.tip);
    if (badCopy) return badCopy;
    const element = resolveIndexedElement(controller, input.index);
    if (element && !isVisibleTarget(element)) {
      return `Rejected: element ${input.index} is not visible on screen. Point at a visible element instead, or use go_to_page.`;
    }
    if (!element) {
      // Never point at nothing: fall back to a centred explanation.
      await bridge.presentStep({
        kind: "explain",
        title: input.title,
        tip: input.tip,
        element: null,
      });
      return `Element ${input.index} was not found, so the tip was shown without a highlight and the user pressed Next.`;
    }
    const pathBefore = window.location.pathname;
    const expectsNavigation = linkTargetPath(element) !== null;
    const stopListening = completeOnUserAction(element, kind, bridge.advance);
    try {
      await bridge.presentStep({
        kind,
        title: input.title,
        tip: input.tip,
        element,
      });
    } finally {
      stopListening();
    }
    await settleAfterAction(pathBefore, expectsNavigation, signal);
    return kind === "type"
      ? `The user filled in element ${input.index}.`
      : `The user clicked element ${input.index}. Read the page again before the next step.`;
  }

  return {
    click_element_by_index: null,
    input_text: null,
    select_dropdown_option: null,
    execute_javascript: null,
    ask_user: null,
    guide_click: tool({
      description:
        "Highlight one interactive element and explain, in one short line, why the user should click it. Waits until the user clicks it.",
      inputSchema: pointerSchema,
      execute: async function guideClick(input, { signal }) {
        return pointAt(this.pageController, "click", input, signal);
      },
    }),
    guide_type: tool({
      description:
        "Highlight a text field and tell the user what to type there. Waits until the user fills it in. Never put secrets in the tip.",
      inputSchema: pointerSchema,
      execute: async function guideType(input, { signal }) {
        return pointAt(this.pageController, "type", input, signal);
      },
    }),
    go_to_page: tool({
      description: `Open one of the app's pages directly. Only these routes are allowed: ${bridge.allowedRoutes.join(", ")}.`,
      inputSchema: z.object({ route: z.string() }),
      execute: async function goToPage(input, { signal }) {
        if (!bridge.allowedRoutes.includes(input.route)) {
          return `Route ${input.route} is not allowed. Use one of: ${bridge.allowedRoutes.join(", ")}.`;
        }
        bridge.navigate(input.route);
        await waitFor(SETTLE_AFTER_ACTION_MS, signal);
        return `Opened ${input.route}.`;
      },
    }),
    explain: tool({
      description:
        "Show a short explanation with nothing highlighted, for context the user needs before the next step. Waits until the user presses Next.",
      inputSchema: explainSchema,
      execute: async function explain(input) {
        const badCopy = rejectCopy(input.title, input.tip);
        if (badCopy) return badCopy;
        await bridge.presentStep({ kind: "explain", ...input, element: null });
        return "The user read the explanation and pressed Next.";
      },
    }),
    done: tool({
      description:
        "Finish the guide. `text` is a one or two sentence wrap-up of what the user achieved or should do next.",
      inputSchema: z.object({
        title: z.string().optional(),
        text: z.string(),
        success: z.boolean().default(true),
      }),
      execute: async function done(input) {
        await bridge.presentStep({
          kind: "done",
          title: input.title || bridge.doneTitle,
          tip: input.text,
          element: null,
        });
        return "Task completed";
      },
    }),
  };
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Long token-like runs (API keys, PATs, JWTs, hashes).
const SECRET_LIKE =
  /\b(?:sk|pk|ghp|gho|ghu|ghs|github_pat|xox[abprs]|eyJ)[\w-]{10,}|\b[A-Za-z0-9_-]{32,}\b/g;
const VALUE_ATTRIBUTE = /\bvalue=("[^"]*"|'[^']*'|\S+)/g;

/**
 * Scrubs the page text before it reaches the model: email addresses,
 * token-like strings and form field values never leave the browser.
 */
export function redactPageContent(content: string): string {
  return content
    .replace(VALUE_ATTRIBUTE, "value=[redacted]")
    .replace(EMAIL, "[email]")
    .replace(SECRET_LIKE, "[redacted]");
}
