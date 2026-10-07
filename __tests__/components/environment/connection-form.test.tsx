import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionForm } from "#/components/features/environment/connections/connection-form";
import { getConnectorManifest } from "#/lib/environment/registry";
import type { ConnectionRecord } from "#/lib/data-platform/repositories/connections-repository";

const manifest = getConnectorManifest("linear")!;
const posthogManifest = getConnectorManifest("posthog")!;

function makeConnection(
  config: Record<string, string>,
): ConnectionRecord {
  return {
    id: "conn-1",
    orgId: "org-1",
    capability: "observability",
    providerId: "posthog",
    instanceKey: "default",
    displayName: null,
    config,
    redactedSummary: {},
    requestedScopes: [],
    grantedScopes: [],
    status: "ok",
    lastProbe: null,
    lastProbeAt: null,
    expiresAt: null,
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("ConnectionForm", () => {
  it("blocks submit and shows a required-field error when a required field is left empty", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <ConnectionForm
        manifest={manifest}
        submitLabel="Connect"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId("connection-submit-linear"));

    expect(
      await screen.findByTestId("connector-field-apiKey-error"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits once a value satisfying the field's pattern is entered", async () => {
    // `apiKey` requires the `lin_api_` prefix. A value that fails the pattern
    // must be corrected before this form's own `handleSubmit` ever calls
    // `onSubmit` -- nothing else in the app blocks a malformed key from
    // reaching `EnvironmentService.setCredentials` otherwise.
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <ConnectionForm
        manifest={manifest}
        submitLabel="Connect"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );

    const field = screen.getByTestId("connector-field-apiKey");
    await user.type(field, "not-a-valid-key");
    await user.click(screen.getByTestId("connection-submit-linear"));

    expect(
      await screen.findByTestId("connector-field-apiKey-error"),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(field);
    await user.type(field, "lin_api_abc123");
    await user.click(screen.getByTestId("connection-submit-linear"));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ apiKey: "lin_api_abc123" }));
  });

  it("does not overwrite a field the user already started typing when the saved connection resolves afterward", async () => {
    // Regression: `existingConnection` commonly arrives from a still-loading
    // query. If the user starts editing a non-secret field (e.g.
    // `instanceHost`) before it resolves, the seeding effect used to run
    // once it did and stomp on whatever they had just typed.
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <ConnectionForm
        manifest={posthogManifest}
        submitLabel="Connect"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        existingConnection={null}
      />,
    );

    const hostField = screen.getByTestId("connector-field-instanceHost");
    await user.clear(hostField);
    await user.type(hostField, "custom.example.com");
    expect(hostField).toHaveValue("custom.example.com");

    // The connections query resolves after the user has already edited the
    // field, carrying a *different* stored host.
    rerender(
      <ConnectionForm
        manifest={posthogManifest}
        submitLabel="Connect"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        existingConnection={makeConnection({
          instanceHost: "stored.example.com",
        })}
      />,
    );

    await waitFor(() =>
      expect(hostField).toHaveValue("custom.example.com"),
    );
  });
});
