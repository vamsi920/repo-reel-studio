import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { AgentProfileActionsMenu } from "#/components/features/settings/agent-profiles/agent-profile-actions-menu";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        SETTINGS$PROFILE_EDIT: "Edit",
        SETTINGS$PROFILE_SET_ACTIVE: "Set as active",
        BUTTON$DELETE: "Delete",
      };
      return translations[key] || key;
    },
  }),
}));

const defaultProps = {
  onEdit: vi.fn(),
  onSetActive: vi.fn(),
  onDelete: vi.fn(),
  isActive: false,
  isActivating: false,
  onClose: vi.fn(),
};

function mountAnchor() {
  const anchor = document.createElement("button");
  anchor.setAttribute("data-testid", "agent-profile-menu-trigger");
  document.body.appendChild(anchor);
  return anchor;
}

describe("AgentProfileActionsMenu", () => {
  it("renders Edit, Set Active and Delete in order", () => {
    render(<AgentProfileActionsMenu {...defaultProps} />);

    const testIds = screen
      .getAllByRole("menuitem")
      .map((item) => item.getAttribute("data-testid"));
    expect(testIds).toEqual([
      "agent-profile-edit",
      "agent-profile-set-active",
      "agent-profile-delete",
    ]);
  });

  it("runs the action and closes when an item is clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onClose = vi.fn();
    render(
      <AgentProfileActionsMenu
        {...defaultProps}
        onDelete={onDelete}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByTestId("agent-profile-delete"));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables Set Active for the active profile and while activating", () => {
    const { rerender } = render(
      <AgentProfileActionsMenu {...defaultProps} isActive />,
    );
    expect(screen.getByTestId("agent-profile-set-active")).toBeDisabled();

    rerender(<AgentProfileActionsMenu {...defaultProps} isActivating />);
    expect(screen.getByTestId("agent-profile-set-active")).toBeDisabled();
  });

  it("closes on Escape and on mousedown outside, but not on the anchor", () => {
    const onClose = vi.fn();
    const anchor = mountAnchor();
    render(
      <div>
        <div data-testid="outside">Outside</div>
        <AgentProfileActionsMenu
          {...defaultProps}
          onClose={onClose}
          anchorRef={{ current: anchor }}
        />
      </div>,
    );

    fireEvent.mouseDown(anchor);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
    anchor.remove();
  });

  describe("keyboard navigation", () => {
    it("focuses the first item on mount, including when portaled", () => {
      const anchor = mountAnchor();
      render(
        <AgentProfileActionsMenu
          {...defaultProps}
          anchorRef={{ current: anchor }}
        />,
      );

      expect(screen.getByTestId("agent-profile-edit")).toHaveFocus();
      anchor.remove();
    });

    it("arrows over the disabled Set Active item instead of sticking on it", async () => {
      const user = userEvent.setup();
      render(<AgentProfileActionsMenu {...defaultProps} isActive />);

      await user.keyboard("{ArrowDown}");
      expect(screen.getByTestId("agent-profile-delete")).toHaveFocus();

      await user.keyboard("{ArrowUp}");
      expect(screen.getByTestId("agent-profile-edit")).toHaveFocus();
    });

    it("wraps around and supports Home/End", async () => {
      const user = userEvent.setup();
      render(<AgentProfileActionsMenu {...defaultProps} />);

      await user.keyboard("{ArrowUp}");
      expect(screen.getByTestId("agent-profile-delete")).toHaveFocus();

      await user.keyboard("{Home}");
      expect(screen.getByTestId("agent-profile-edit")).toHaveFocus();

      await user.keyboard("{End}");
      expect(screen.getByTestId("agent-profile-delete")).toHaveFocus();
    });

    it("returns focus to the anchor when closed with Escape", async () => {
      const user = userEvent.setup();
      const anchor = mountAnchor();

      function Host() {
        const [open, setOpen] = useState(true);
        return open ? (
          <AgentProfileActionsMenu
            {...defaultProps}
            anchorRef={{ current: anchor }}
            onClose={() => setOpen(false)}
          />
        ) : null;
      }
      render(<Host />);

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      expect(anchor).toHaveFocus();
      anchor.remove();
    });
  });
});
