import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileItem } from "#/components/features/files/file-item";

vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string, options?: { filename?: string }) =>
        options?.filename ? `${key}:${options.filename}` : key,
    }),
  };
});

describe("FileItem", () => {
  it("renders the filename and repeats it as the title for truncated names", () => {
    render(<FileItem filename="src/index.ts" />);

    const name = screen.getByText("src/index.ts");
    expect(name).toBeInTheDocument();
    expect(name).toHaveAttribute("title", "src/index.ts");
  });

  it("omits the remove button when no onRemove handler is passed", () => {
    render(<FileItem filename="src/index.ts" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names the remove button after the file and calls onRemove when clicked", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FileItem filename="src/index.ts" onRemove={onRemove} />);

    const removeButton = screen.getByRole("button", {
      name: "FILE_ITEM$REMOVE_FILE:src/index.ts",
    });
    await user.click(removeButton);

    expect(onRemove).toHaveBeenCalledOnce();
  });
});
