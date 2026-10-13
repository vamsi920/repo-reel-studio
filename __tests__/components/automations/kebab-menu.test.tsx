import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { KebabMenu } from "#/components/features/automations/kebab-menu";

describe("KebabMenu", () => {
  it("opens the menu and invokes an item's onClick when selected", async () => {
    const onClick = vi.fn();
    render(
      <KebabMenu items={[{ label: "Delete", icon: <span />, onClick }]} />,
    );

    // Open the menu, then select the item (rendered via KebabMenuItemContent).
    fireEvent.click(
      screen.getByRole("button", { name: "AUTOMATIONS$ACTIONS_MENU" }),
    );
    fireEvent.click(await screen.findByText("Delete"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // React bubbles portal events up the component tree: a click on the menu's
  // padding reached the row underneath and opened the detail page.
  it("keeps clicks inside the open menu from reaching the row behind it", async () => {
    const onRowClick = vi.fn();
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={onRowClick}>
        <KebabMenu
          items={[{ label: "Delete", icon: <span />, onClick: vi.fn() }]}
        />
      </div>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "AUTOMATIONS$ACTIONS_MENU" }),
    );
    onRowClick.mockClear();

    const item = await screen.findByText("Delete");
    fireEvent.click(item.closest("[style]") ?? item.parentElement!);

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
