import { I18nKey } from "#/i18n/declaration";
import { automationListPath } from "#/manifests/automation-interface";

export type TutorialStepId =
  | "welcome"
  | "ask"
  | "attach"
  | "model"
  | "customize"
  | "automations"
  | "security"
  | "environment"
  | "agentops"
  | "knowledge"
  | "usage"
  | "settings"
  | "finish";

export interface TutorialStep {
  id: TutorialStepId;
  titleKey: I18nKey;
  /** Narration shown as the step's "subtitle" caption. */
  subtitleKey: I18nKey;
  /** Short bullet points shown under the subtitle (a couple per module). */
  pointKeys?: readonly I18nKey[];
  /** Bubble color scheme; light by default, dark sets Security apart. */
  tone?: "light" | "dark";
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
 * The guided tour, in order. The first steps spotlight the controls on the
 * home page a new user needs first; the rest visit every module in the
 * sidebar with a one-line summary and a couple of short points each. Each
 * step that owns a `route` takes the user to that page so the tip narrates
 * what they are actually looking at.
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
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ASK_POINT_1,
        I18nKey.TUTORIAL$STEP_ASK_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: ["chat-input"],
    },
    {
      // The home launcher only offers repositories; once one is picked the
      // button is replaced by its git control bar preview.
      id: "attach",
      titleKey: I18nKey.TUTORIAL$STEP_ATTACH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ATTACH_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ATTACH_POINT_1,
        I18nKey.TUTORIAL$STEP_ATTACH_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: ["open-repository-button", "home-git-control-bar-preview"],
    },
    {
      // Cloud backends show a model picker, local ones an LLM profile picker.
      id: "model",
      titleKey: I18nKey.TUTORIAL$STEP_MODEL_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_MODEL_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_MODEL_POINT_1,
        I18nKey.TUTORIAL$STEP_MODEL_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: ["chat-input-llm-model", "chat-input-llm-profile"],
    },
    {
      id: "customize",
      titleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_CUSTOMIZE_POINT_1,
        I18nKey.TUTORIAL$STEP_CUSTOMIZE_POINT_2,
      ],
      route: "/customize",
      anchorTestIds: ["sidebar-skills-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "automations",
      titleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AUTOMATIONS_POINT_1,
        I18nKey.TUTORIAL$STEP_AUTOMATIONS_POINT_2,
      ],
      route: automationListPath(),
      anchorTestIds: ["sidebar-automations-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "security",
      titleKey: I18nKey.TUTORIAL$STEP_SECURITY_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SECURITY_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SECURITY_POINT_1,
        I18nKey.TUTORIAL$STEP_SECURITY_POINT_2,
      ],
      tone: "dark",
      route: "/security",
      anchorTestIds: ["sidebar-security-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "environment",
      titleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ENVIRONMENT_POINT_1,
        I18nKey.TUTORIAL$STEP_ENVIRONMENT_POINT_2,
      ],
      route: "/environment",
      anchorTestIds: ["sidebar-environment-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "agentops",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AGENTOPS_POINT_1,
        I18nKey.TUTORIAL$STEP_AGENTOPS_POINT_2,
      ],
      route: "/agentops",
      anchorTestIds: ["sidebar-agentops-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "knowledge",
      titleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_KNOWLEDGE_POINT_1,
        I18nKey.TUTORIAL$STEP_KNOWLEDGE_POINT_2,
      ],
      route: "/kt",
      anchorTestIds: ["sidebar-kt-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "usage",
      titleKey: I18nKey.TUTORIAL$STEP_USAGE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_USAGE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_USAGE_POINT_1,
        I18nKey.TUTORIAL$STEP_USAGE_POINT_2,
      ],
      route: "/usage",
      anchorTestIds: ["sidebar-usage-link", MOBILE_MENU_TOGGLE_TEST_ID],
    },
    {
      id: "settings",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SETTINGS_POINT_1,
        I18nKey.TUTORIAL$STEP_SETTINGS_POINT_2,
      ],
      route: "/settings",
      anchorTestIds: [
        "collapsed-settings-link",
        "backend-selector-settings-link",
        "user-menu-trigger",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "finish",
      titleKey: I18nKey.TUTORIAL$STEP_FINISH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_FINISH_SUBTITLE,
      anchorTestIds: [TUTORIAL_LAUNCHER_ANCHOR_TEST_ID],
    },
  ];
}
