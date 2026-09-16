import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import {
  HighlightedSourceView,
  MAX_HIGHLIGHT_BYTES,
  MAX_HIGHLIGHT_LINES,
  isTooLargeToHighlight,
} from "#/components/features/files-tab/highlighted-source-view";

// Prism is the expensive part under test; stub it so these tests assert
// *which* path is chosen without paying for a real highlight.
vi.mock("#/components/features/markdown/syntax-highlighter", () => ({
  SyntaxHighlighter: ({ children }: { children: string }) => (
    <code data-testid="prism-stub">{children.length}</code>
  ),
}));

describe("isTooLargeToHighlight", () => {
  it("is false for a small file", () => {
    expect(isTooLargeToHighlight("def f():\n    return 1\n")).toBe(false);
  });

  it("is true past the byte ceiling regardless of line count", () => {
    expect(isTooLargeToHighlight("x".repeat(MAX_HIGHLIGHT_BYTES + 1))).toBe(
      true,
    );
    expect(isTooLargeToHighlight("x".repeat(MAX_HIGHLIGHT_BYTES))).toBe(false);
  });

  it("is true past the line ceiling even when the bytes are small", () => {
    const atLimit = "\n".repeat(MAX_HIGHLIGHT_LINES - 1);
    const overLimit = "\n".repeat(MAX_HIGHLIGHT_LINES);
    expect(isTooLargeToHighlight(atLimit)).toBe(false);
    expect(isTooLargeToHighlight(overLimit)).toBe(true);
  });
});

describe("HighlightedSourceView", () => {
  it("highlights a small source file with Prism", () => {
    // Arrange + Act
    render(<HighlightedSourceView path="a.py" text={"print(1)\n"} />);

    // Assert
    const highlighted = screen.getByTestId("file-content-viewer-highlighted");
    expect(highlighted).toHaveAttribute("data-language", "python");
    expect(screen.getByTestId("prism-stub")).toBeInTheDocument();
    expect(
      screen.queryByTestId("file-content-viewer-large-file-note"),
    ).not.toBeInTheDocument();
  });

  it("skips Prism and shows the plain <pre> plus a note for a file over the line ceiling", () => {
    // Arrange: 20,000 short lines — well under the byte ceiling, far over
    // the line ceiling (the explorer's 3.6 s freeze case).
    const text = Array.from({ length: 20_000 }, (_, i) => `x${i}=1`).join("\n");

    // Act
    render(<HighlightedSourceView path="big.py" text={text} />);

    // Assert
    expect(screen.queryByTestId("prism-stub")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("file-content-viewer-highlighted"),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("file-content-viewer-plain")).toHaveTextContent(
      "x19999=1",
    );
    expect(
      screen.getByTestId("file-content-viewer-large-file-note"),
    ).toHaveTextContent("FILES$LARGE_FILE_HIGHLIGHTING_OFF");
  });

  it("skips Prism for a file over the byte ceiling", () => {
    // Arrange: one very long JSON line.
    const text = `{"a":"${"y".repeat(MAX_HIGHLIGHT_BYTES)}"}`;

    // Act
    render(<HighlightedSourceView path="big.json" text={text} />);

    // Assert
    expect(screen.queryByTestId("prism-stub")).not.toBeInTheDocument();
    expect(screen.getByTestId("file-content-viewer-plain")).toBeInTheDocument();
    expect(
      screen.getByTestId("file-content-viewer-large-file-note"),
    ).toBeInTheDocument();
  });

  it("shows the plain <pre> without the large-file note when there is no grammar", () => {
    // Arrange + Act
    render(<HighlightedSourceView path="notes.log" text="hello" />);

    // Assert
    expect(screen.getByTestId("file-content-viewer-plain")).toHaveTextContent(
      "hello",
    );
    expect(
      screen.queryByTestId("file-content-viewer-large-file-note"),
    ).not.toBeInTheDocument();
  });
});
