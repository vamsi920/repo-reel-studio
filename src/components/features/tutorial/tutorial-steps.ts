import { I18nKey } from "#/i18n/declaration";
import { automationListPath } from "#/manifests/automation-interface";

export type TutorialStepId =
  | "welcome"
  | "conversations"
  | "customize"
  | "automations"
  | "environment"
  | "agentops"
  | "knowledge"
  | "settings"
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
 * The guided tour, in order. Each step that owns a `route` takes the user to
 * that page so the caption narrates what they are actually looking at.
 */
export function getTutorialSteps(): TutorialStep[] {
  return [
    {
      id: "welcome",
      titleKey: I18nKey.TUTORIAL$STEP_WELCOME_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_WELCOME_SUBTITLE,
    },
    {
      id: "conversations",
      titleKey: I18nKey.TUTORIAL$STEP_CONVERSATIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CONVERSATIONS_SUBTITLE,
      route: "/conversations",
      anchorTestIds: ["sidebar-conversations-link", MOBILE_MENU_TOGGLE_TEST_ID],
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
      id: "environment",
      titleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_SUBTITLE,
      route: "/environment",
      anchorTestIds: ["sidebar-environment-link", MOBILE_MENU_TOGGLE_TEST_ID],
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
      id: "settings",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_SUBTITLE,
      route: "/settings",
      anchorTestIds: [
        "collapsed-settings-link",
        "user-menu-trigger",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "finish",
      titleKey: I18nKey.TUTORIAL$STEP_FINISH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_FINISH_SUBTITLE,
    },
  ];
}
