import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import { SearchInput } from "#/components/features/automations/search-input";

describe("SearchInput", () => {
  it("calls onChange when user types", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="" onChange={onChange} />);

    const input = screen.getByRole("textbox");
    await user.type(input, "test");

    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenLastCalledWith("t");
  });

  it("displays the current value", () => {
    render(<SearchInput value="security" onChange={vi.fn()} />);

    expect(screen.getByRole("textbox")).toHaveValue("security");
  });

  it("does not render a clear button when the value is empty", () => {
    render(<SearchInput value="" onChange={vi.fn()} />);

    expect(
      screen.queryByTestId("automations-search-clear"),
    ).not.toBeInTheDocument();
  });

  it("clears the search when the clear button is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchInput value="security" onChange={onChange} />);

    await user.click(screen.getByTestId("automations-search-clear"));

    expect(onChange).toHaveBeenCalledWith("");
  });
});
