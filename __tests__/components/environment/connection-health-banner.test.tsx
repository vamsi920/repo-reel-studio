import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionHealthBanner } from "#/components/features/environment/connection-health-banner";
import { NavigationProvider } from "#/context/navigation-context";
import {
  __resetMcpHealthStoreForTests,
  setMcpServerHealth,
} from "#/api/mcp-health/mcp-health-store";
import { getMcpServerHealthKey } from "#/utils/mcp-server-health-key";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";
import { flattenMcpConfig } from "#/utils/mcp-installed-servers";

const state = vi.hoisted(() => ({
  connections: [] as unknown[],
  mcpConfig: {} as Record<string, unknown>,
}));

// Same seam the other environment component tests use: the hooks' own
// repositories are covered by their own tests.
vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: state.connections }),
}));
vi.mock("#/hooks/query/use-settings", () => ({
  useSettings: () => ({ data: { mcp_config: state.mcpConfig } }),
}));

const DAY = 24 * 60 * 60_000;

function record(overrides: Partial<ConnectionRecord>): ConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    capability: "issue-tracker",
    providerId: "linear",
    instanceKey: "default",
    displayName: null,
    config: {},
    redactedSummary: {},
    requestedScopes: [],
    grantedScopes: [],
    status: "ok",
    lastProbe: null,
    lastProbeAt: null,
    expiresAt: null,
    createdBy: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...overrides,
  };
}

function renderBanner(navigate = vi.fn()) {
  render(
    <NavigationProvider
      value={{
        currentPath: "/",
        conversationId: null,
        isNavigating: false,
        navigate,
      }}
    >
      <ConnectionHealthBanner />
    </NavigationProvider>,
  );
  return navigate;
}

beforeEach(() => {
  sessionStorage.clear();
  state.connections = [];
  state.mcpConfig = {};
  __resetMcpHealthStoreForTests();
});

describe("ConnectionHealthBanner", () => {
  it("renders nothing when everything works", () => {
    state.connections = [record({ status: "ok" })];
    renderBanner();
    expect(
      screen.queryByTestId("connection-health-banner"),
    ).not.toBeInTheDocument();
  });

  it("puts a broken connection ahead of one that is merely expiring", () => {
    state.connections = [
      record({
        id: "soon",
        providerId: "github",
        expiresAt: new Date(Date.now() + DAY).toISOString(),
      }),
      record({ id: "dead", status: "revoked" }),
    ];
    renderBanner();
    const banner = screen.getByTestId("connection-health-banner");
    expect(banner).toHaveAttribute("data-kind", "connection-reconnect");
    expect(banner).toHaveAttribute("role", "alert");
  });

  it("warns, without alarming, about a token that lapses soon", () => {
    state.connections = [
      record({
        providerId: "github",
        expiresAt: new Date(Date.now() + DAY).toISOString(),
      }),
    ];
    renderBanner();
    const banner = screen.getByTestId("connection-health-banner");
    expect(banner).toHaveAttribute("data-kind", "connection-expiring");
    expect(banner).toHaveAttribute("role", "status");
  });

  it("sends the user to the MCP page when a server's credentials were rejected", async () => {
    state.mcpConfig = {
      slack: {
        transport: "stdio",
        command: "npx",
        args: ["@zencoderai/slack-mcp-server"],
      },
    };
    const [server] = flattenMcpConfig(state.mcpConfig as never);
    setMcpServerHealth(getMcpServerHealthKey(server), {
      status: "failed",
      kind: "credentials",
      error: "401",
      checkedAt: 1,
    });
    const navigate = renderBanner();

    await userEvent.click(
      screen.getByTestId("connection-health-banner-reconnect"),
    );

    expect(navigate).toHaveBeenCalledWith("/mcp");
  });

  it("stays dismissed for the session once dismissed", async () => {
    state.connections = [record({ status: "expired" })];
    renderBanner();
    await userEvent.click(
      screen.getByTestId("connection-health-banner-dismiss"),
    );
    expect(
      screen.queryByTestId("connection-health-banner"),
    ).not.toBeInTheDocument();
  });
});
