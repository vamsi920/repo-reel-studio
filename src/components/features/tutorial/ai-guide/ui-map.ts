import type { I18nKey } from "#/i18n/declaration";
import { automationListPath } from "#/manifests/automation-interface";
import {
  getTutorialSteps,
  MOBILE_MENU_TOGGLE_TEST_ID,
} from "../tutorial-steps";

/**
 * Where a control lives: on a page (reached by route), or inside a dialog
 * that some other control opens on that page.
 */
export interface UiMapEntry {
  /** Stable id the planner refers to, e.g. "automations.add". */
  id: string;
  route: string;
  /** `data-testid`s that locate the control, in preference order. */
  testIds: string[];
  /** Short name of the control as the user sees it. */
  label: string;
  /** What it does, so the planner can pick the right one. */
  purpose: string;
  /** Lives inside a dialog opened by this entry id, not on the page itself. */
  inDialogOf?: string;
}

/**
 * Controls inside pages that the 50-step product tour doesn't spotlight,
 * curated for the flows people ask about most. Every test id here is checked
 * against the source by a unit test, so the map can't silently go stale.
 */
const IN_PAGE_ENTRIES: UiMapEntry[] = [
  // Home
  {
    id: "home.chat_input",
    route: "/conversations",
    testIds: ["chat-input"],
    label: "Chat box",
    purpose: "Describe a task for the agent to start a new conversation.",
  },
  {
    id: "home.open_repository",
    route: "/conversations",
    testIds: ["open-repository-button"],
    label: "Open Repository",
    purpose: "Attach a GitHub repository to the next conversation.",
  },
  {
    id: "home.model_picker",
    route: "/conversations",
    testIds: ["chat-input-llm-model", "chat-input-llm-profile"],
    label: "Model picker",
    purpose: "Choose which AI model or LLM profile runs the conversation.",
  },
  // Automations
  {
    id: "automations.add",
    route: "/automations",
    testIds: ["automations-add-automation", "automations-create-automation"],
    label: "Add Automation",
    purpose: "Open the form to create a new scheduled automation.",
  },
  {
    id: "automations.import",
    route: "/automations",
    testIds: ["automations-import-automation"],
    label: "Import automation",
    purpose: "Import an automation from a JSON file.",
  },
  {
    id: "automations.pull_requests",
    route: "/automations",
    testIds: ["automations-pull-requests-link"],
    label: "Pull Requests",
    purpose: "See pull requests opened by automations.",
  },
  {
    id: "automations.templates",
    route: "/automations",
    testIds: ["automations-navigation-templates"],
    label: "Templates",
    purpose: "Browse ready-made automation templates.",
  },
  {
    id: "automation_form.name",
    route: "/automations",
    testIds: ["create-automation-name"],
    label: "Name",
    purpose: "Name the new automation.",
    inDialogOf: "automations.add",
  },
  {
    id: "automation_form.instructions",
    route: "/automations",
    testIds: ["create-automation-prompt"],
    label: "Instructions",
    purpose: "What the agent should do on every run.",
    inDialogOf: "automations.add",
  },
  {
    id: "automation_form.repository",
    route: "/automations",
    testIds: ["create-automation-repository"],
    label: "Repository",
    purpose: "Which repository the automation works in (owner/repo).",
    inDialogOf: "automations.add",
  },
  {
    id: "automation_form.frequency",
    route: "/automations",
    testIds: ["create-automation-frequency"],
    label: "Runs",
    purpose: "How often the automation runs.",
    inDialogOf: "automations.add",
  },
  {
    id: "automation_form.time",
    route: "/automations",
    testIds: ["create-automation-time"],
    label: "At",
    purpose: "The time of day it runs.",
    inDialogOf: "automations.add",
  },
  {
    id: "automation_form.submit",
    route: "/automations",
    testIds: ["create-automation-submit"],
    label: "Create automation",
    purpose: "Save and create the automation.",
    inDialogOf: "automations.add",
  },
  // Environment / connections
  {
    id: "environment.connections_tab",
    route: "/environment",
    testIds: ["environment-tab-connections"],
    label: "Connections",
    purpose: "Open the list of services you can connect.",
  },
  {
    id: "connections.github_connect",
    route: "/environment/connections",
    testIds: ["connector-connect-github"],
    label: "Connect GitHub",
    purpose: "Start connecting your GitHub account.",
  },
  // Customize / MCP / skills
  {
    id: "mcp.add_custom",
    route: "/mcp",
    testIds: ["mcp-add-custom-server"],
    label: "Add custom server",
    purpose: "Add your own MCP server by URL or command.",
  },
  {
    id: "mcp.search",
    route: "/mcp",
    testIds: ["mcp-search-input"],
    label: "Search servers",
    purpose: "Find an MCP server in the marketplace.",
  },
  {
    id: "mcp.marketplace",
    route: "/mcp",
    testIds: ["mcp-marketplace-grid", "mcp-marketplace-section"],
    label: "Marketplace",
    purpose: "Pick a ready-made MCP server to install.",
  },
  {
    id: "skills.add",
    route: "/skills",
    testIds: ["skills-add-skill-button"],
    label: "Add skill",
    purpose: "Add a skill that teaches the agent your conventions.",
  },
  // AgentOps
  {
    id: "agentops.budgets_tab",
    route: "/agentops",
    testIds: ["agentops-tab-budgets"],
    label: "Budgets",
    purpose: "Open spending limits for runs and agents.",
  },
  {
    id: "agentops.save_policies",
    route: "/agentops/budgets",
    testIds: ["agentops-save-policies"],
    label: "Save",
    purpose: "Save the budget limits you set.",
  },
  {
    id: "agentops.approvals_tab",
    route: "/agentops",
    testIds: ["agentops-tab-approvals"],
    label: "Approvals",
    purpose: "Review actions waiting for your OK.",
  },
  // Knowledge
  {
    id: "kt.add_repository",
    route: "/kt",
    testIds: ["kt-add-repository-button"],
    label: "Add Repository",
    purpose: "Connect a repository to generate its knowledge docs.",
  },
  {
    id: "kt.generate",
    route: "/kt",
    testIds: ["kt-generate-button"],
    label: "Generate",
    purpose: "Generate docs, code graph and videos for a repository.",
  },
  // Settings
  {
    id: "settings.llm",
    route: "/settings",
    testIds: ["sidebar-settings-/settings/llm"],
    label: "LLM Profiles",
    purpose: "Create and pick saved model profiles with API keys.",
  },
  {
    id: "settings.secrets",
    route: "/settings",
    testIds: ["sidebar-settings-/settings/secrets"],
    label: "Secrets",
    purpose: "Store API keys and tokens the agent can use.",
  },
  {
    id: "settings.add_secret",
    route: "/settings/secrets",
    testIds: ["add-secret-button"],
    label: "Add a new secret",
    purpose: "Store a new API key or token.",
  },
];

/**
 * The full map the planner chooses from: one "go to this area" entry per
 * product-tour step (sidebar links and the tabs inside each module) plus the
 * curated in-page controls above.
 */
export function getUiMap(translate: (key: I18nKey) => string): UiMapEntry[] {
  const tourEntries: UiMapEntry[] = getTutorialSteps()
    .filter((step) => step.route && step.anchorTestIds?.length)
    .map((step) => ({
      id: `tour.${step.id}`,
      route: step.route as string,
      testIds: (step.anchorTestIds ?? []).filter(
        (id) => id !== MOBILE_MENU_TOGGLE_TEST_ID,
      ),
      label: translate(step.titleKey),
      purpose: translate(step.subtitleKey),
    }))
    .filter((entry) => entry.testIds.length > 0);
  return [...tourEntries, ...IN_PAGE_ENTRIES].map((entry) =>
    entry.route === "/automations"
      ? { ...entry, route: automationListPath() }
      : entry,
  );
}

/** Test ids the curated entries rely on (for the staleness test). */
export function getCuratedUiMapTestIds(): string[] {
  return IN_PAGE_ENTRIES.flatMap((entry) => entry.testIds);
}
