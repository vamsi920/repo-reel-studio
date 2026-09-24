import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { FileTreeView } from "#/components/features/files-tab/file-tree-view";

// FileTreeView composes the recursive TreeNode (extracted into its own file).
// The route-level files-tab test treats the tree as a black box, so these
// cover the tree's own user-facing behavior: empty state, directory
// expand/collapse, and file selection.
describe("FileTreeView", () => {
  it("shows the empty-state message and no tree when there are no files", () => {
    // Arrange + Act
    render(
      <FileTreeView paths={[]} selectedPath={null} onSelectFile={vi.fn()} />,
    );

    // Assert
    expect(screen.getByText("FILES$NO_FILES")).toBeInTheDocument();
    expect(screen.queryByTestId("file-tree-view")).not.toBeInTheDocument();
  });

  it("keeps a directory collapsed until clicked, then reveals its children", async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <FileTreeView
        paths={["src/main.ts"]}
        selectedPath={null}
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: the directory row shows but its nested file is hidden.
    expect(screen.getByTestId("file-tree-dir-src")).toBeInTheDocument();
    expect(
      screen.queryByTestId("file-tree-file-src/main.ts"),
    ).not.toBeInTheDocument();

    // Act: expand the directory.
    await user.click(screen.getByTestId("file-tree-dir-src"));

    // Assert: the nested file is now visible.
    expect(
      screen.getByTestId("file-tree-file-src/main.ts"),
    ).toBeInTheDocument();
  });

  it("calls onSelectFile with the file path when a file row is clicked", async () => {
    // Arrange
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    render(
      <FileTreeView
        paths={["README.md"]}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Act
    await user.click(screen.getByTestId("file-tree-file-README.md"));

    // Assert
    expect(onSelectFile).toHaveBeenCalledTimes(1);
    expect(onSelectFile).toHaveBeenCalledWith("README.md");
  });

  it("marks the selected file row with aria-current", () => {
    // Arrange + Act: the directory auto-expands because it holds the
    // selection (see the dedicated auto-expand test below), so no click
    // is needed here to reach the row.
    render(
      <FileTreeView
        paths={["src/a.txt", "src/b.txt"]}
        selectedPath="src/a.txt"
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: the selection is exposed to assistive technology, not only
    // through the background colour.
    expect(screen.getByTestId("file-tree-file-src/a.txt")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByTestId("file-tree-file-src/b.txt")).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("auto-expands every ancestor directory of the selected file", () => {
    // Arrange + Act: a file nested two directories deep is already
    // selected when the tree first renders (e.g. the auto-select-on-load
    // effect, or the agent's canvas_ui tool driving the files-tab store
    // directly) — the user never clicked anything to expand these folders.
    render(
      <FileTreeView
        paths={["src/features/widget.ts", "src/features/other.ts"]}
        selectedPath="src/features/widget.ts"
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: both ancestor directories are already open and the selected
    // file's row is visible without any manual expand click.
    expect(screen.getByTestId("file-tree-dir-src")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByTestId("file-tree-dir-src/features"),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByTestId("file-tree-file-src/features/widget.ts"),
    ).toHaveAttribute("aria-current", "true");
  });

  it("does not treat a sibling directory whose name is a prefix as an ancestor of the selection", () => {
    // Arrange + Act: `src-legacy/b.ts` is selected. A naive containment
    // check (`selectedPath.startsWith(node.path)` with no separator) would
    // treat "src" as an ancestor of "src-legacy/b.ts" too, since the string
    // "src-legacy/b.ts" does start with "src". That would wrongly
    // auto-expand the unrelated `src` directory and could even render its
    // own child as selected if it shared a path.
    render(
      <FileTreeView
        paths={["src/a.ts", "src-legacy/b.ts"]}
        selectedPath="src-legacy/b.ts"
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: only the real ancestor (`src-legacy`) auto-expands and shows
    // the selected file; the unrelated `src` directory stays collapsed.
    expect(screen.getByTestId("file-tree-dir-src-legacy")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByTestId("file-tree-file-src-legacy/b.ts"),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("file-tree-dir-src")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByTestId("file-tree-file-src/a.ts"),
    ).not.toBeInTheDocument();
  });

  it("auto-expands ancestor directories when the selection changes after mount", () => {
    // Arrange: nothing selected on first render, so both directories start
    // collapsed — this is the case the component's own comment calls out:
    // the initial `useState` only covers the first render, a *later*
    // selection (e.g. the canvas_ui tool driving the store directly) relies
    // on the effect instead.
    const { rerender } = render(
      <FileTreeView
        paths={["src/features/widget.ts", "src/features/other.ts"]}
        selectedPath={null}
        onSelectFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("file-tree-dir-src")).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Act: a selection arrives after mount, with no user click at all.
    rerender(
      <FileTreeView
        paths={["src/features/widget.ts", "src/features/other.ts"]}
        selectedPath="src/features/widget.ts"
        onSelectFile={vi.fn()}
      />,
    );

    // Assert: both ancestor directories opened on their own.
    expect(screen.getByTestId("file-tree-dir-src")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByTestId("file-tree-dir-src/features"),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByTestId("file-tree-file-src/features/widget.ts"),
    ).toHaveAttribute("aria-current", "true");
  });

  it("does not force a directory back open after the user collapses it", async () => {
    // Arrange
    const user = userEvent.setup();
    render(
      <FileTreeView
        paths={["src/a.txt"]}
        selectedPath="src/a.txt"
        onSelectFile={vi.fn()}
      />,
    );
    expect(screen.getByTestId("file-tree-file-src/a.txt")).toBeInTheDocument();

    // Act: the user manually collapses the auto-opened directory while its
    // file is still selected.
    await user.click(screen.getByTestId("file-tree-dir-src"));

    // Assert: their choice sticks — it isn't immediately re-opened.
    expect(
      screen.queryByTestId("file-tree-file-src/a.txt"),
    ).not.toBeInTheDocument();
  });
});
