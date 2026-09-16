import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { FileQuickRow } from "#/components/features/files-tab/file-quick-row";

describe("FileQuickRow", () => {
  it("marks only the selected file chip with aria-current", () => {
    // Arrange + Act
    render(
      <FileQuickRow
        paths={["README.md", "src/a.txt"]}
        selectedPath="src/a.txt"
        onSelectFile={vi.fn()}
        isTreeVisible={false}
        onToggleTree={vi.fn()}
      />,
    );

    // Assert: the selection is exposed to assistive technology, not only
    // through the background colour.
    expect(screen.getByTestId("file-quick-row-item-src/a.txt")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByTestId("file-quick-row-item-README.md"),
    ).not.toHaveAttribute("aria-current");
  });
});
