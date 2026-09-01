import {
  type RouteConfig,
  layout,
  index,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/welcome.tsx"),
  route("login", "routes/login.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  layout("routes/root-layout.tsx", [
    route("conversations", "routes/home.tsx"),
    route(
      "conversations/:conversationId/panel",
      "routes/conversation-panel.tsx",
    ),
    route("conversations/:conversationId", "routes/conversation.tsx"),
    route("launch", "routes/launch.tsx"),
    route("customize", "routes/extensions-hub.tsx"),
    route("skills", "routes/skills-settings.tsx"),
    route("plugins", "routes/skills-plugins.tsx"),
    route("mcp", "routes/mcp.tsx"),
    route("settings", "routes/settings.tsx", [
      index("routes/settings-index.tsx"),
      route("llm", "routes/llm-settings.tsx"),
      route("agent", "routes/agent-settings.tsx"),
      route("agents", "routes/agent-profiles-settings.tsx"),
      route("condenser", "routes/condenser-settings.tsx"),
      route("agent-context", "routes/agent-context-settings.tsx"),
      route("verification", "routes/verification-settings.tsx"),
      route("app", "routes/app-settings.tsx"),
      route("connections", "routes/connections-settings.tsx"),
      route("secrets", "routes/secrets-settings.tsx"),
    ]),
    route("oauth/device/verify", "routes/device-verify.tsx"),
    route("automations", "routes/automations-list.tsx"),
    route("automations/templates", "routes/automation-templates.tsx"),
    // Must stay ahead of the `:automationId` catch-all below, or a literal
    // "pull-requests" segment would be swallowed as an automation id instead.
    route("automations/pull-requests", "routes/automation-pull-requests.tsx"),
    route("automations/new/:automationId", "routes/automation-setup-route.tsx"),
    route("automations/:automationId", "routes/automation-detail.tsx"),
    route("security", "routes/security.tsx"),
    // Must stay ahead of the `environment` layout below: the setup studio is a
    // full-bleed two-pane surface, not another tab, and must not inherit the
    // layout's tab strip or scroll container. Being a sibling also guarantees
    // it is never mounted at the same time as `conversations/:conversationId`
    // -- two live conversation sockets would fight over the global event store.
    route("environment/setup", "routes/environment-setup.tsx"),
    route("environment", "routes/environment.tsx", [
      index("routes/environment-overview.tsx"),
      route("connections", "routes/environment-connections.tsx"),
      route("network", "routes/environment-network.tsx"),
      route("requirements", "routes/environment-requirements.tsx"),
      route("runbook", "routes/environment-runbook.tsx"),
    ]),
    route("usage", "routes/usage.tsx"),
    route("agentops", "routes/agentops.tsx", [
      index("routes/agentops-overview.tsx"),
      route("live", "routes/agentops-live-runs.tsx"),
      route("approvals", "routes/agentops-approvals.tsx"),
      route("history", "routes/agentops-history.tsx"),
      route("budgets", "routes/agentops-budgets.tsx"),
      route("runs/:runId", "routes/agentops-run.tsx"),
    ]),
    route("kt", "routes/kt-list.tsx"),
    route("kt/:repositoryId", "routes/kt-repository.tsx"),
    // The two static Knowledge tabs must be declared before the `:pageId`
    // wildcard, or "graph"/"video" would be matched as page ids.
    route("kt/:repositoryId/graph", "routes/kt-graph.tsx"),
    route("kt/:repositoryId/video", "routes/kt-video-list.tsx"),
    route("kt/:repositoryId/:pageId", "routes/kt-page.tsx"),
  ]),
  route(
    "shared/conversations/:conversationId",
    "routes/shared-conversation.tsx",
  ),
] satisfies RouteConfig;
