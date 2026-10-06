import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectorCard } from "#/components/features/environment/connections/connector-card";
import { getConnectorManifest } from "#/lib/environment/registry";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

const manifest = getConnectorManifest("linear")!;

function connectionWith(
  overrides: Partial<ConnectionRecord> = {},
): ConnectionRecord {
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
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ConnectorCard", () => {
  it("flags a scope downgrade instead of showing a plain connected badge", () => {
    // The difference between "connected" and "connected, and something will
    // 403 next week" only shows up here -- a granted-scope set missing an
    // entry from requestedScopes must not read the same as a full grant.
    const connection = connectionWith({
      requestedScopes: ["read", "write"],
      grantedScopes: ["read"],
    });
    render(
      <ConnectorCard
        manifest={manifest}
        connection={connection}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    expect(screen.getByText(/write/)).toBeInTheDocument();
  });

  it("calls onTest and onDisconnect with the connection record when clicked", async () => {
    const connection = connectionWith();
    const onTest = vi.fn();
    const onDisconnect = vi.fn();
    const user = userEvent.setup();
    render(
      <ConnectorCard
        manifest={manifest}
        connection={connection}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={onDisconnect}
        onTest={onTest}
      />,
    );

    await user.click(screen.getByTestId("connector-test-linear"));
    await user.click(screen.getByTestId("connector-disconnect-linear"));

    expect(onTest).toHaveBeenCalledWith(connection);
    expect(onDisconnect).toHaveBeenCalledWith(connection);
  });

  it("labels the docs link with a translated name, not the raw provider id", () => {
    // The link used to render `manifest.id` (e.g. "linear") as its only
    // visible text, with no accessible name explaining what it links to.
    render(
      <ConnectorCard
        manifest={manifest}
        connection={undefined}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    const link = screen.getByTestId("connector-docs-linear");
    expect(link).toHaveTextContent("ENVIRONMENT$VIEW_DOCS");
    expect(link).toHaveAccessibleName("ENVIRONMENT$VIEW_DOCS_FOR");
  });

  it("gives each Connect/Test/Disconnect button a per-provider accessible name", () => {
    // Every provider card's Connect/Test/Disconnect button used to share the
    // exact same bare accessible name ("Connect", "Test", "Disconnect"), so a
    // screen-reader user browsing by a buttons-only list heard the same
    // label repeated for every one of the 35+ provider cards with no way to
    // tell them apart -- mirrors the per-card disambiguation the docs link
    // already had.
    const connection = connectionWith();
    const { rerender } = render(
      <ConnectorCard
        manifest={manifest}
        connection={connection}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("connector-test-linear")).toHaveAccessibleName(
      "ENVIRONMENT$TEST_CONNECTION_FOR",
    );
    expect(
      screen.getByTestId("connector-disconnect-linear"),
    ).toHaveAccessibleName("ENVIRONMENT$DISCONNECT_PROVIDER");

    rerender(
      <ConnectorCard
        manifest={manifest}
        connection={undefined}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("connector-connect-linear")).toHaveAccessibleName(
      "ENVIRONMENT$CONNECT_PROVIDER",
    );
  });

  it("disables Connect while the connections list is still loading its first answer", () => {
    // `connection` is indistinguishable from "confirmed disconnected" in this
    // window -- offering an active Connect button here risks a redundant
    // connection attempt on a provider that may already be connected.
    render(
      <ConnectorCard
        manifest={manifest}
        connection={undefined}
        index={0}
        pending
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );

    expect(screen.getByTestId("connector-connect-linear")).toBeDisabled();
  });

  it("offers Reconnect only for a connection that stopped working", async () => {
    const onReconnect = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ConnectorCard
        manifest={manifest}
        connection={connectionWith({ status: "ok" })}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
        onReconnect={onReconnect}
      />,
    );
    expect(
      screen.queryByTestId("connector-reconnect-linear"),
    ).not.toBeInTheDocument();

    const revoked = connectionWith({ status: "revoked" });
    rerender(
      <ConnectorCard
        manifest={manifest}
        connection={revoked}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
        onReconnect={onReconnect}
      />,
    );
    await user.click(screen.getByTestId("connector-reconnect-linear"));
    expect(onReconnect).toHaveBeenCalledWith(revoked);
    expect(
      screen.getByTestId("connector-needs-reconnect-linear"),
    ).toBeInTheDocument();
  });

  it("renders no Reconnect control when no handler can act on it", () => {
    render(
      <ConnectorCard
        manifest={manifest}
        connection={connectionWith({ status: "expired" })}
        index={0}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        onTest={vi.fn()}
      />,
    );
    expect(
      screen.queryByTestId("connector-reconnect-linear"),
    ).not.toBeInTheDocument();
  });
});
