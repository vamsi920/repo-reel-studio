/**
 * Dumps the exact agent settings the app sends when it starts a local
 * conversation, using the app's own builder (buildStartConversationRequest),
 * so the token benchmark runs the agent with byte-identical system context:
 * tools, bundled skills and the system_message_suffix.
 *
 * Run: npx vitest run case-studies/tokens/bench/dump-app-context.test.ts
 * Writes case-studies/tokens/bench/out/app-agent-settings.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { buildStartConversationRequest } from "#/api/agent-server-adapter";
import { DEFAULT_SETTINGS } from "#/services/settings";

const backend = {
  id: "default-local",
  name: "Local backend",
  host: "http://127.0.0.1:8000",
  apiKey: "session-key",
  kind: "local" as const,
};

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return { getServerInfo: vi.fn() };
  }),
}));
vi.mock("#/api/agent-server-config", () => ({
  getAgentServerBaseUrl: vi.fn(() => "http://127.0.0.1:8000"),
  getAgentServerSessionApiKey: vi.fn(() => null),
  getAgentServerWorkingDir: vi.fn(() => "workspace/project"),
  shouldLoadPublicSkills: vi.fn(() => true),
  syncBakedSessionApiKey: vi.fn(),
}));
vi.mock("#/api/agent-server-compatibility", () => ({
  // The real local stack advertises every tool (browser included).
  isAgentServerToolAvailable: vi.fn(() => true),
  getCachedAgentServerInfo: vi.fn(() => null),
}));
vi.mock("#/api/backend-registry/active-store", () => ({
  getEffectiveLocalBackend: vi.fn(() => backend),
  getActiveBackend: vi.fn(() => ({ backend, orgId: null })),
}));

// What `npm run dev` advertises in /server_info.runtime_services.
const RUNTIME_SERVICES = {
  mode: "dev:automation",
  services: {
    agent_server: {
      description:
        "The OpenHands Agent Server this agent is running inside. Tool calls (terminal, file_editor, browser, etc.) execute here.",
      url_from_agent: "http://localhost:18000",
    },
    ingress: {
      description:
        "Unified entry point. Routes /api/automation/* to the automation backend, /api/* and /sockets to the agent-server, and /* to the frontend.",
      url_from_agent: "http://localhost:8000",
    },
    frontend: {
      kind: "vite" as const,
      description: "Vite dev server hosting the agent-canvas frontend.",
      url_from_agent: "http://localhost:3001",
    },
    automation: {
      description:
        "OpenHands Automations service. All routes are mounted under '/api/automation'. Authenticate with header 'X-Session-API-Key: $OPENHANDS_AUTOMATION_API_KEY'.",
      url_from_agent: "http://localhost:18001",
      api_prefix: "/api/automation",
      docs_url: "http://localhost:18001/api/automation/docs",
      openapi_url: "http://localhost:18001/api/automation/openapi.json",
      auth_env_var: "OPENHANDS_AUTOMATION_API_KEY",
    },
  },
};

it("dumps the agent settings the app sends", () => {
  const payload = buildStartConversationRequest({
    settings: DEFAULT_SETTINGS,
    query: "benchmark",
    runtimeServicesInfo: RUNTIME_SERVICES,
  }) as { agent_settings: Record<string, unknown> };

  const out = join(__dirname, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "app-agent-settings.json"),
    `${JSON.stringify(payload.agent_settings, null, 2)}\n`,
  );
  expect(payload.agent_settings).toBeTruthy();
});
