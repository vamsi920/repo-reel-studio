import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddSkillModal } from "#/components/features/skills/add-skill-modal";
import { ADD_SKILL_EXAMPLE_COMMAND } from "#/constants/skills-docs";

function stubClipboard(clipboard: Clipboard | undefined) {
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
    writable: true,
  });
}

describe("AddSkillModal", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
    vi.restoreAllMocks();
  });

  it("closes when the dismiss button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddSkillModal onClose={onClose} />);

    await user.click(screen.getByTestId("add-skill-modal-dismiss"));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the header close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<AddSkillModal onClose={onClose} />);

    await user.click(screen.getByTestId("add-skill-modal-close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("renders the example add-skill command and a working docs link", () => {
    render(<AddSkillModal onClose={vi.fn()} />);

    expect(screen.getByTestId("add-skill-modal-example")).toHaveTextContent(
      ADD_SKILL_EXAMPLE_COMMAND,
    );
    expect(
      screen.getByTestId("add-skill-modal-docs-link"),
    ).toHaveAttribute("target", "_blank");
  });

  it("copies the example command and disables the button while copied", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard({ writeText } as unknown as Clipboard);
    render(<AddSkillModal onClose={vi.fn()} />);

    const copyButton = screen.getByTestId("add-skill-modal-example-copy");
    await user.click(copyButton);

    expect(writeText).toHaveBeenCalledWith(ADD_SKILL_EXAMPLE_COMMAND);
    expect(copyButton).toBeDisabled();
  });

  it("does not flip to the copied state when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    stubClipboard({ writeText } as unknown as Clipboard);
    render(<AddSkillModal onClose={vi.fn()} />);

    const copyButton = screen.getByTestId("add-skill-modal-example-copy");
    // fireEvent (not userEvent) here: userEvent's multi-event click sequence
    // races the rejected clipboard promise in this environment and never
    // dispatches the click; a plain synchronous click event does not.
    fireEvent.click(copyButton);
    await waitFor(() => expect(writeText).toHaveBeenCalled());

    expect(copyButton).not.toBeDisabled();
  });
});
