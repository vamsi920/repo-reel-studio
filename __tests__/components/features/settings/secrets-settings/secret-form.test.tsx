import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecretsService } from "#/api/secrets-service";
import { SecretForm } from "#/components/features/settings/secrets-settings/secret-form";
import { renderWithProviders } from "../../../../../test-utils";

const renderEditForm = async (
  { updateFails }: { updateFails?: boolean } = {},
) => {
  vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([
    { name: "API_KEY", description: "Demo secret" },
  ]);
  const updateSecretSpy = vi.spyOn(SecretsService, "updateSecret");
  const updateSecret = updateFails
    ? updateSecretSpy.mockRejectedValue(new Error("boom"))
    : updateSecretSpy.mockResolvedValue(undefined);
  const onCancel = vi.fn();

  renderWithProviders(
    <SecretForm mode="edit" selectedSecret="API_KEY" onCancel={onCancel} />,
  );

  // The description default is applied once the secrets query settles.
  await waitFor(() =>
    expect(screen.getByTestId("description-input")).toHaveValue("Demo secret"),
  );

  return { updateSecret, onCancel };
};

describe("SecretForm in add mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a duplicate name even when a stale selectedSecret matches it", async () => {
    // Arrange - selectedSecret can be left over from a cancelled delete/edit
    // on the list screen; it must not exempt that name from the add-mode
    // duplicate check.
    vi.spyOn(SecretsService, "getSecrets").mockResolvedValue([
      { name: "OPENAI_KEY", description: "Existing secret" },
    ]);
    const createSecretSpy = vi
      .spyOn(SecretsService, "createSecret")
      .mockResolvedValue(undefined);
    const onCancel = vi.fn();

    renderWithProviders(
      <SecretForm
        mode="add"
        selectedSecret="OPENAI_KEY"
        onCancel={onCancel}
      />,
    );

    await waitFor(() =>
      expect(SecretsService.getSecrets).toHaveBeenCalled(),
    );

    // Act
    await userEvent.type(screen.getByTestId("name-input"), "OPENAI_KEY");
    await userEvent.type(screen.getByTestId("value-input"), "sk-new-value");
    await userEvent.click(screen.getByTestId("submit-button"));

    // Assert - the duplicate error must block the overwrite.
    await waitFor(() =>
      expect(
        screen.getByText("SECRETS$SECRET_ALREADY_EXISTS"),
      ).toBeInTheDocument(),
    );
    expect(createSecretSpy).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("SecretForm in edit mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("offers a blank value field labelled for preserving the existing value", async () => {
    // Arrange & Act
    await renderEditForm();

    // Assert
    expect(screen.getByTestId("value-input")).toHaveValue("");
    expect(
      screen.getByText("SECRETS$SECRET_VALUE_LEAVE_BLANK"),
    ).toBeInTheDocument();
  });

  it("keeps the stored value when the value field is left blank", async () => {
    // Arrange
    const { updateSecret } = await renderEditForm();

    // Act
    await userEvent.click(screen.getByTestId("submit-button"));

    // Assert
    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "API_KEY",
        "API_KEY",
        "Demo secret",
        undefined,
      ),
    );
  });

  it("overwrites the stored value with the one entered", async () => {
    // Arrange
    const { updateSecret } = await renderEditForm();

    // Act
    await userEvent.type(screen.getByTestId("value-input"), "sk-new-value");
    await userEvent.click(screen.getByTestId("submit-button"));

    // Assert
    await waitFor(() =>
      expect(updateSecret).toHaveBeenCalledWith(
        "API_KEY",
        "API_KEY",
        "Demo secret",
        "sk-new-value",
      ),
    );
  });

  it("closes the form once the save succeeds", async () => {
    // Arrange
    const { onCancel } = await renderEditForm();

    // Act
    await userEvent.click(screen.getByTestId("submit-button"));

    // Assert
    await waitFor(() => expect(onCancel).toHaveBeenCalled());
  });

  it("keeps the form open when the save fails", async () => {
    // Arrange
    const { updateSecret, onCancel } = await renderEditForm({
      updateFails: true,
    });

    // Act
    await userEvent.type(screen.getByTestId("value-input"), "sk-new-value");
    await userEvent.click(screen.getByTestId("submit-button"));

    // Assert - closing here would silently discard the typed secret value.
    await waitFor(() => expect(updateSecret).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("submit-button")).toBeEnabled(),
    );
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("value-input")).toHaveValue("sk-new-value");
  });
});
