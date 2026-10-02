import { I18nKey } from "#/i18n/declaration";
import { automationListPath } from "#/manifests/automation-interface";

export type TutorialStepId =
  | "welcome"
  | "ask"
  | "attach"
  | "model"
  | "customize"
  | "automations"
  | "agentops"
  | "knowledge"
  | "finish";

export interface TutorialStep {
  id: TutorialStepId;
  titleKey: I18nKey;
  /** Narration shown as the step's "subtitle" caption. */
  subtitleKey: I18nKey;
  /** Route the tour navigates to when this step becomes active. */
  route?: string;
  /**
   * `data-testid`s of the UI element this step talks about, in preference
   * order. The first one that is actually on screen gets the spotlight (the
   * expanded and collapsed sidebars render different elements). On a phone
   * the sidebar itself is off-screen until the user opens it, so every
   * routed step falls back to `MOBILE_MENU_TOGGLE_TEST_ID` — the hamburger
   * button that reveals it.
   */
  anchorTestIds?: string[];
}

/**
 * `data-testid` of the hamburger button that opens the mobile nav drawer.
 * Rendered both in the standalone mobile top bar and in the conversation
 * page's own header, and hidden on desktop widths — a reliable spotlight
 * fallback for any step whose real sidebar link is off-screen on a phone.
 */
export const MOBILE_MENU_TOGGLE_TEST_ID = "sidebar-mobile-menu-toggle";

/**
 * `data-testid` of the left-edge launcher (see `tutorial-launcher.tsx`),
 * repeated here so the steps module stays free of component imports.
 */
const TUTORIAL_LAUNCHER_ANCHOR_TEST_ID = "tutorial-launcher";

/** The page the in-page "ask / attach / model" steps walk through. */
const HOME_ROUTE = "/conversations";

/**
 * The guided tour, in order. Kept short on purpose: the first steps
 * spotlight the controls on the home page a new user needs first, the rest
 * give a one-line tour of the main areas in the sidebar. Each step that owns
 * a `route` takes the user to that page so the tip narrates what they are
 * actually looking at.
 */
export function getTutorialSteps(): TutorialStep[] {
  return [
    {
      id: "welcome",
      titleKey: I18nKey.TUTORIAL$STEP_WELCOME_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_WELCOME_SUBTITLE,
    },
    {
      id: "ask",
      titleKey: I18nKey.TUTORIAL$STEP_ASK_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ASK_SUBTITLE,
      route: HOME_ROUTE,
      anchorTestIds: ["chat-input"],
    },
    {
      id: "attach",
      titleKey: I18nKey.TUTORIAL$STEP_ATTACH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ATTACH_SUBTITLE,
      route: HOME_ROUTE,
      // The home launcher only offers repositories; once one is picked the
      // button is replaced by its git control bar preview.
      anchorTestIds: ["open-repository-button", "home-git-control-bar-preview"],
    },
    {
      id: "model",
      titleKey: I18nKey.TUTORIAL$STEP_MODEL_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_MODEL_SUBTITLE,
      route: HOME_ROUTE,
      // Cloud backends show a model picker, local ones an LLM profile picker.
      anchorTestIds: ["chat-input-llm-model", "chat-input-llm-profile"],
    },
    {
      id: "customize",
      titleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE,
      route: "/customize",
      anchorTestIds: ["sidebar-skills-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "automations",
      titleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_SUBTITLE,
      route: automationListPath(),
      anchorTestIds: ["sidebar-automations-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "agentops",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_SUBTITLE,
      route: "/agentops",
      anchorTestIds: ["sidebar-agentops-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "knowledge",
      titleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_SUBTITLE,
      route: "/kt",
      anchorTestIds: ["sidebar-kt-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "finish",
      titleKey: I18nKey.TUTORIAL$STEP_FINISH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_FINISH_SUBTITLE,
      anchorTestIds: [TUTORIAL_LAUNCHER_ANCHOR_TEST_ID],
    },
  ];
}
