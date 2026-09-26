import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionForm } from "#/components/features/environment/connections/connection-form";
import { getConnectorManifest } from "#/lib/environment/registry";

const manifest = getConnectorManifest("linear")!;

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
});
