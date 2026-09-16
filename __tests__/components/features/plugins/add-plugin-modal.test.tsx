import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@openhands/typescript-client";
import { AddPluginModal } from "#/components/features/plugins/add-plugin-modal";
import PluginsManagementService from "#/api/plugins-management-service";
import { createAgentServerQueryClient } from "#/query-client-config";
import * as ToastHandlers from "#/utils/custom-toast-handlers";

function renderAddPluginModal(
  onClose = vi.fn(),
  client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  render(<AddPluginModal onClose={onClose} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  return { onClose };
}

describe("AddPluginModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("installs the plugin with the entered source on submit", async () => {
    const user = userEvent.setup();
    const installSpy = vi
      .spyOn(PluginsManagementService, "installPlugin")
      .mockResolvedValue({
        name: "weather",
        version: "1.0.0",
        description: "",
        enabled: true,
        source: "github:acme/weather",
        resolved_ref: null,
        repo_path: null,
        installed_at: "2026-06-01T00:00:00Z",
        install_path: "/home/.openhands/plugins/installed/weather",
      });

    renderAddPluginModal();
    await user.type(
      screen.getByTestId("add-plugin-source-input"),
      "github:acme/weather",
    );
    await user.click(screen.getByTestId("add-plugin-submit"));

    await waitFor(() =>
      expect(installSpy).toHaveBeenCalledWith({
        source: "github:acme/weather",
        ref: null,
        repo_path: null,
      }),
    );
  });

  it("disables the submit button while the source field is empty", () => {
    renderAddPluginModal();

    expect(screen.getByTestId("add-plugin-submit")).toBeDisabled();
  });

  it("shows the backend's reason inline, toasts it once and keeps the modal open when install fails", async () => {
    const user = userEvent.setup();
    const detail =
      "Failed to fetch plugin source. Check that the source is valid.";
    vi.spyOn(PluginsManagementService, "installPlugin").mockRejectedValue(
      new HttpError(
        400,
        "Bad Request",
        { detail },
        `HTTP request failed (400 Bad Request): ${JSON.stringify({ detail })}`,
      ),
    );
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => undefined);

    // The app's real query client also toasts failed mutations globally;
    // the install mutation must opt out so the user sees exactly one toast.
    const { onClose } = renderAddPluginModal(
      vi.fn(),
      createAgentServerQueryClient(),
    );
    await user.type(
      screen.getByTestId("add-plugin-source-input"),
      "not a valid source!!",
    );
    await user.click(screen.getByTestId("add-plugin-submit"));

    const inlineError = await screen.findByTestId("add-plugin-error");
    expect(inlineError).toHaveTextContent(detail);
    expect(inlineError).toHaveAttribute("role", "alert");
    await waitFor(() => expect(toastSpy).toHaveBeenCalledTimes(1));
    expect(toastSpy).toHaveBeenCalledWith(detail, {
      error: expect.any(HttpError),
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("add-plugin-modal")).toBeInTheDocument();
  });
});
