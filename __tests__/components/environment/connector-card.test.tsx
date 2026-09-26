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
});
