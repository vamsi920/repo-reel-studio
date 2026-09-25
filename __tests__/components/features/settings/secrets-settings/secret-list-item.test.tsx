import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SecretListItem } from "#/components/features/settings/secrets-settings/secret-list-item";

describe("SecretListItem", () => {
  it("routes the edit and delete button labels through i18n instead of interpolating the raw secret name", () => {
    // Arrange & Act
    render(
      <table>
        <tbody>
          <SecretListItem
            title="API_KEY"
            description="Demo secret"
            onEdit={vi.fn()}
            onDelete={vi.fn()}
          />
        </tbody>
      </table>,
    );

    // Assert - the mocked t() returns the key verbatim, so a hardcoded
    // `Edit ${title}` string (bypassing i18n) would not match these keys.
    expect(
      screen.getByRole("button", { name: "SECRETS$EDIT_SECRET_ARIA" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "SECRETS$DELETE_SECRET_ARIA" }),
    ).toBeInTheDocument();
  });

  it("calls onEdit and onDelete when their respective buttons are clicked", async () => {
    // Arrange
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    render(
      <table>
        <tbody>
          <SecretListItem
            title="API_KEY"
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </tbody>
      </table>,
    );

    // Act
    await userEvent.click(screen.getByTestId("edit-secret-button"));
    await userEvent.click(screen.getByTestId("delete-secret-button"));

    // Assert
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
