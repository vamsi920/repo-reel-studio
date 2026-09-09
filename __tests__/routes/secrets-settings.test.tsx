import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecretsSettingsScreen } from "#/routes/secrets-settings";
import { SecretsService } from "#/api/secrets-service";

function renderSecretsSettingsScreen() {
  return render(<SecretsSettingsScreen />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })}
      >
        {children}
      </QueryClientProvider>
    ),
  });
}

describe("SecretsSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the OSS secrets list for local secrets management", async () => {
    // Mock getSecrets (used by useSearchSecrets internally)
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([
      {
        name: "MY_SECRET",
        description: "Demo secret",
      },
    ]);

    renderSecretsSettingsScreen();

    await screen.findByTestId("secrets-settings-screen");
    expect(await screen.findByText("MY_SECRET")).toBeInTheDocument();
    expect(screen.getByTestId("add-secret-button")).toBeInTheDocument();
  });

  it("shows an empty state only when the list really is empty", async () => {
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([]);

    renderSecretsSettingsScreen();

    expect(await screen.findByTestId("secrets-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("secrets-error")).not.toBeInTheDocument();
  });

  it("distinguishes a failed load from an empty list", async () => {
    vi.spyOn(SecretsService, "getSecrets").mockRejectedValue(
      new Error("boom"),
    );

    renderSecretsSettingsScreen();

    // A failed fetch must not read as "you have no secrets" - that looks
    // like the stored secrets disappeared.
    expect(await screen.findByTestId("secrets-error")).toBeInTheDocument();
    expect(screen.queryByTestId("secrets-empty")).not.toBeInTheDocument();
    expect(screen.getByTestId("retry-secrets-button")).toBeInTheDocument();
    expect(screen.getByTestId("add-secret-button")).toBeDisabled();
  });

  it("retries the fetch from the error state", async () => {
    const getSecrets = vi
      .spyOn(SecretsService, "getSecrets")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([{ name: "MY_SECRET", description: "Demo secret" }]);

    renderSecretsSettingsScreen();

    await userEvent.click(await screen.findByTestId("retry-secrets-button"));

    expect(await screen.findByText("MY_SECRET")).toBeInTheDocument();
    expect(screen.queryByTestId("secrets-error")).not.toBeInTheDocument();
    expect(getSecrets).toHaveBeenCalledTimes(2);
  });
});