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
}

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
    },
    {
      id: "customize",
      titleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE,
      route: "/customize",
    },
    {
      id: "automations",
      titleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AUTOMATIONS_SUBTITLE,
      route: automationListPath(),
    },
    {
      id: "environment",
      titleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENVIRONMENT_SUBTITLE,
      route: "/environment",
    },
    {
      id: "agentops",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_SUBTITLE,
      route: "/agentops",
    },
    {
      id: "knowledge",
      titleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_SUBTITLE,
      route: "/kt",
    },
    {
      id: "settings",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_SUBTITLE,
      route: "/settings",
    },
    {
      id: "finish",
      titleKey: I18nKey.TUTORIAL$STEP_FINISH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_FINISH_SUBTITLE,
    },
  ];
}
