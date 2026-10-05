import { I18nKey } from "#/i18n/declaration";
import { automationListPath } from "#/manifests/automation-interface";

export type TutorialStepId =
  | "welcome"
  | "commands"
  | "ask"
  | "attach"
  | "model"
  | "backend"
  | "onboarding-agent"
  | "conversations"
  | "customize"
  | "mcp-installed"
  | "skills"
  | "plugins"
  | "automations"
  | "pull-requests"
  | "templates"
  | "security"
  | "security-areas"
  | "environment"
  | "environment-connections"
  | "environment-network"
  | "environment-requirements"
  | "environment-runbook"
  | "agentops"
  | "agentops-live"
  | "agentops-approvals"
  | "agentops-history"
  | "agentops-budgets"
  | "knowledge"
  | "knowledge-tabs"
  | "usage"
  | "usage-workspace"
  | "usage-memory"
  | "settings"
  | "settings-llm"
  | "settings-agent"
  | "settings-connections"
  | "settings-secrets"
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

/** The page the home-page steps (commands, ask, attach, model, ...) walk through. */
const HOME_ROUTE = "/conversations";

/**
 * The guided tour, in order. It opens on the home page's own controls, then
 * visits every module and goes one level inside it: each module gets one to
 * three steps that spotlight its real tabs and actions (Customize's MCP,
 * Skills and Plugins pages, Environment's tabs, AgentOps' tabs, ...), each
 * with a one-line summary and two short points. Steps whose first anchor is
 * a sidebar link fall back to `MOBILE_MENU_TOGGLE_TEST_ID` on a phone (and
 * open the mobile drawer); in-page steps don't, so the drawer never covers
 * the page they describe. A step whose anchor isn't on screen (empty
 * states, Cloud-only differences) simply centers its bubble.
 */
export function getTutorialSteps(): TutorialStep[] {
  return [
    {
      id: "welcome",
      titleKey: I18nKey.TUTORIAL$STEP_WELCOME_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_WELCOME_SUBTITLE,
    },
    {
      id: "commands",
      titleKey: I18nKey.TUTORIAL$STEP_COMMANDS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_COMMANDS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_COMMANDS_POINT_1,
        I18nKey.TUTORIAL$STEP_COMMANDS_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: ["command-menu-trigger"],
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
      id: "backend",
      titleKey: I18nKey.TUTORIAL$STEP_BACKEND_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_BACKEND_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_BACKEND_POINT_1,
        I18nKey.TUTORIAL$STEP_BACKEND_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: [
        "backend-selector",
        "collapsed-backend-selector-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      // The dock is hidden on /environment/setup, never on the home page.
      id: "onboarding-agent",
      titleKey: I18nKey.TUTORIAL$STEP_ONBOARDING_AGENT_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ONBOARDING_AGENT_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ONBOARDING_AGENT_POINT_1,
        I18nKey.TUTORIAL$STEP_ONBOARDING_AGENT_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: ["onboarding-dock-trigger"],
    },
    {
      // The list only renders in the expanded sidebar.
      id: "conversations",
      titleKey: I18nKey.TUTORIAL$STEP_CONVERSATIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CONVERSATIONS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_CONVERSATIONS_POINT_1,
        I18nKey.TUTORIAL$STEP_CONVERSATIONS_POINT_2,
      ],
      route: HOME_ROUTE,
      anchorTestIds: [
        "conversation-panel",
        "sidebar-conversations-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      // /customize redirects to /mcp on desktop; the Customize nav's own MCP
      // link is the first choice, the sidebar entry the fallback.
      id: "customize",
      titleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_CUSTOMIZE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_CUSTOMIZE_POINT_1,
        I18nKey.TUTORIAL$STEP_CUSTOMIZE_POINT_2,
      ],
      route: "/mcp",
      anchorTestIds: [
        "sidebar-extensions-/mcp",
        "sidebar-skills-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "mcp-installed",
      titleKey: I18nKey.TUTORIAL$STEP_MCP_INSTALLED_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_MCP_INSTALLED_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_MCP_INSTALLED_POINT_1,
        I18nKey.TUTORIAL$STEP_MCP_INSTALLED_POINT_2,
      ],
      route: "/mcp",
      anchorTestIds: [
        "mcp-installed-list",
        "mcp-installed-empty",
        "mcp-toolbar",
      ],
    },
    {
      id: "skills",
      titleKey: I18nKey.TUTORIAL$STEP_SKILLS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SKILLS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SKILLS_POINT_1,
        I18nKey.TUTORIAL$STEP_SKILLS_POINT_2,
      ],
      route: "/skills",
      anchorTestIds: ["skills-add-skill-button", "sidebar-extensions-/skills"],
    },
    {
      // Hidden on Cloud backends, where the bubble just centers.
      id: "plugins",
      titleKey: I18nKey.TUTORIAL$STEP_PLUGINS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_PLUGINS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_PLUGINS_POINT_1,
        I18nKey.TUTORIAL$STEP_PLUGINS_POINT_2,
      ],
      route: "/plugins",
      anchorTestIds: ["skills-plugins-screen", "sidebar-extensions-/plugins"],
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
      anchorTestIds: [
        "automations-add-automation",
        "sidebar-automations-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "pull-requests",
      titleKey: I18nKey.TUTORIAL$STEP_PULL_REQUESTS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_PULL_REQUESTS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_PULL_REQUESTS_POINT_1,
        I18nKey.TUTORIAL$STEP_PULL_REQUESTS_POINT_2,
      ],
      route: automationListPath(),
      anchorTestIds: [
        "automations-pull-requests-link",
        "sidebar-automations-link",
      ],
    },
    {
      // After Pull Requests: both of those live on the dashboard, and the
      // tour never navigates away from a sub-page of the step's own route.
      id: "templates",
      titleKey: I18nKey.TUTORIAL$STEP_TEMPLATES_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_TEMPLATES_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_TEMPLATES_POINT_1,
        I18nKey.TUTORIAL$STEP_TEMPLATES_POINT_2,
      ],
      route: "/automations/templates",
      anchorTestIds: [
        "automations-navigation-templates",
        "recommended-automations-section",
      ],
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
      anchorTestIds: [
        "security-empty-state",
        "sidebar-security-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "security-areas",
      titleKey: I18nKey.TUTORIAL$STEP_SECURITY_AREAS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SECURITY_AREAS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SECURITY_AREAS_POINT_1,
        I18nKey.TUTORIAL$STEP_SECURITY_AREAS_POINT_2,
      ],
      tone: "dark",
      route: "/security",
      anchorTestIds: ["security-future-areas"],
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
      anchorTestIds: [
        "environment-tab-overview",
        "sidebar-environment-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "environment-connections",
      titleKey: I18nKey.TUTORIAL$STEP_ENV_CONNECTIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENV_CONNECTIONS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ENV_CONNECTIONS_POINT_1,
        I18nKey.TUTORIAL$STEP_ENV_CONNECTIONS_POINT_2,
      ],
      route: "/environment/connections",
      anchorTestIds: ["environment-tab-connections"],
    },
    {
      id: "environment-network",
      titleKey: I18nKey.TUTORIAL$STEP_ENV_NETWORK_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENV_NETWORK_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ENV_NETWORK_POINT_1,
        I18nKey.TUTORIAL$STEP_ENV_NETWORK_POINT_2,
      ],
      route: "/environment/network",
      anchorTestIds: ["environment-tab-network"],
    },
    {
      id: "environment-requirements",
      titleKey: I18nKey.TUTORIAL$STEP_ENV_REQUIREMENTS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENV_REQUIREMENTS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ENV_REQUIREMENTS_POINT_1,
        I18nKey.TUTORIAL$STEP_ENV_REQUIREMENTS_POINT_2,
      ],
      route: "/environment/requirements",
      anchorTestIds: ["environment-tab-requirements"],
    },
    {
      id: "environment-runbook",
      titleKey: I18nKey.TUTORIAL$STEP_ENV_RUNBOOK_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_ENV_RUNBOOK_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_ENV_RUNBOOK_POINT_1,
        I18nKey.TUTORIAL$STEP_ENV_RUNBOOK_POINT_2,
      ],
      route: "/environment/runbook",
      anchorTestIds: ["environment-tab-runbook"],
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
      anchorTestIds: [
        "agentops-tab-overview",
        "sidebar-agentops-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "agentops-live",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_LIVE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_LIVE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AGENTOPS_LIVE_POINT_1,
        I18nKey.TUTORIAL$STEP_AGENTOPS_LIVE_POINT_2,
      ],
      route: "/agentops/live",
      anchorTestIds: ["agentops-tab-live-runs"],
    },
    {
      id: "agentops-approvals",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_APPROVALS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_APPROVALS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AGENTOPS_APPROVALS_POINT_1,
        I18nKey.TUTORIAL$STEP_AGENTOPS_APPROVALS_POINT_2,
      ],
      route: "/agentops/approvals",
      anchorTestIds: ["agentops-tab-approvals"],
    },
    {
      id: "agentops-history",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_HISTORY_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_HISTORY_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AGENTOPS_HISTORY_POINT_1,
        I18nKey.TUTORIAL$STEP_AGENTOPS_HISTORY_POINT_2,
      ],
      route: "/agentops/history",
      anchorTestIds: ["agentops-tab-history"],
    },
    {
      id: "agentops-budgets",
      titleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_BUDGETS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_AGENTOPS_BUDGETS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_AGENTOPS_BUDGETS_POINT_1,
        I18nKey.TUTORIAL$STEP_AGENTOPS_BUDGETS_POINT_2,
      ],
      route: "/agentops/budgets",
      anchorTestIds: ["agentops-tab-budgets"],
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
      anchorTestIds: [
        "kt-add-repository-button",
        "sidebar-kt-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      // The tabs live on each repository's own page; here the bubble points
      // at the repository cards that open it.
      id: "knowledge-tabs",
      titleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_TABS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_KNOWLEDGE_TABS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_KNOWLEDGE_TABS_POINT_1,
        I18nKey.TUTORIAL$STEP_KNOWLEDGE_TABS_POINT_2,
      ],
      route: "/kt",
      anchorTestIds: ["kt-repo-card", "kt-list"],
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
      anchorTestIds: [
        "usage-tab-overview",
        "sidebar-usage-link",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "usage-workspace",
      titleKey: I18nKey.TUTORIAL$STEP_USAGE_WORKSPACE_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_USAGE_WORKSPACE_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_USAGE_WORKSPACE_POINT_1,
        I18nKey.TUTORIAL$STEP_USAGE_WORKSPACE_POINT_2,
      ],
      route: "/usage",
      anchorTestIds: ["usage-workspace-select"],
    },
    {
      id: "usage-memory",
      titleKey: I18nKey.TUTORIAL$STEP_USAGE_MEMORY_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_USAGE_MEMORY_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_USAGE_MEMORY_POINT_1,
        I18nKey.TUTORIAL$STEP_USAGE_MEMORY_POINT_2,
      ],
      route: "/usage",
      anchorTestIds: ["usage-tab-memory-health"],
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
        "settings-navbar-desktop",
        "collapsed-settings-link",
        "backend-selector-settings-link",
        "user-menu-trigger",
        MOBILE_MENU_TOGGLE_TEST_ID,
      ],
    },
    {
      id: "settings-llm",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_LLM_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_LLM_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SETTINGS_LLM_POINT_1,
        I18nKey.TUTORIAL$STEP_SETTINGS_LLM_POINT_2,
      ],
      route: "/settings/llm",
      anchorTestIds: ["sidebar-settings-/settings/llm"],
    },
    {
      // Listed after LLM: an agent profile needs an LLM profile first.
      id: "settings-agent",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_AGENT_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_AGENT_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SETTINGS_AGENT_POINT_1,
        I18nKey.TUTORIAL$STEP_SETTINGS_AGENT_POINT_2,
      ],
      route: "/settings/agents",
      anchorTestIds: ["sidebar-settings-/settings/agents"],
    },
    {
      id: "settings-connections",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_CONNECTIONS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_CONNECTIONS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SETTINGS_CONNECTIONS_POINT_1,
        I18nKey.TUTORIAL$STEP_SETTINGS_CONNECTIONS_POINT_2,
      ],
      route: "/settings/connections",
      anchorTestIds: ["sidebar-settings-/settings/connections"],
    },
    {
      id: "settings-secrets",
      titleKey: I18nKey.TUTORIAL$STEP_SETTINGS_SECRETS_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_SETTINGS_SECRETS_SUBTITLE,
      pointKeys: [
        I18nKey.TUTORIAL$STEP_SETTINGS_SECRETS_POINT_1,
        I18nKey.TUTORIAL$STEP_SETTINGS_SECRETS_POINT_2,
      ],
      route: "/settings/secrets",
      anchorTestIds: ["sidebar-settings-/settings/secrets"],
    },
    {
      id: "finish",
      titleKey: I18nKey.TUTORIAL$STEP_FINISH_TITLE,
      subtitleKey: I18nKey.TUTORIAL$STEP_FINISH_SUBTITLE,
      anchorTestIds: [TUTORIAL_LAUNCHER_ANCHOR_TEST_ID],
    },
  ];
}
