import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PluginsToolbar } from "#/components/features/plugins/plugins-toolbar";

describe("PluginsToolbar", () => {
  it("reports search input changes", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    render(
      <PluginsToolbar
        search=""
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("plugins-search-input"), "a");

    expect(onSearchChange).toHaveBeenCalledWith("a");
  });

  it("hides the clear button when search is empty and clears it on click", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    const { rerender } = render(
      <PluginsToolbar
        search=""
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /clear/i }),
    ).not.toBeInTheDocument();

    rerender(
      <PluginsToolbar
        search="acme"
        onSearchChange={onSearchChange}
        statusFilter="all"
        onStatusFilterChange={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /clear/i }));

    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("marks only the active status filter as pressed and reports clicks on the others", async () => {
    const user = userEvent.setup();
    const onStatusFilterChange = vi.fn();
    render(
      <PluginsToolbar
        search=""
        onSearchChange={vi.fn()}
        statusFilter="installed"
        onStatusFilterChange={onStatusFilterChange}
      />,
    );

    expect(screen.getByTestId("plugins-filter-installed")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("plugins-filter-all")).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(screen.getByTestId("plugins-filter-local"));

    expect(onStatusFilterChange).toHaveBeenCalledWith("local");
  });
});
