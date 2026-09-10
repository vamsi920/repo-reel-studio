import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileList } from "#/components/features/files/file-list";

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

describe("FileList", () => {
  it("renders every file name", () => {
    render(<FileList files={["a.txt", "b.txt"]} />);

    expect(screen.getAllByTestId("file-item")).toHaveLength(2);
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    expect(screen.getByText("b.txt")).toBeInTheDocument();
  });

  it("renders no remove buttons without an onRemove handler", () => {
    render(<FileList files={["a.txt"]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("names each remove button after its file and reports the index", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(<FileList files={["a.txt", "b.txt"]} onRemove={onRemove} />);

    const removeB = screen.getByRole("button", {
      name: "FILE_ITEM$REMOVE_FILE:b.txt",
    });
    await user.click(removeB);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("keeps duplicate file names distinguishable by index", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(<FileList files={["dup.txt", "dup.txt"]} onRemove={onRemove} />);

    const buttons = screen.getAllByRole("button", {
      name: "FILE_ITEM$REMOVE_FILE:dup.txt",
    });
    expect(buttons).toHaveLength(2);

    await user.click(buttons[1]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
