import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiagramPanel } from "#/components/features/kt-video/diagram-panel";
import type { KtScene } from "#/lib/kt-video/build-manifest";

const { renderMock } = vi.hoisted(() => ({ renderMock: vi.fn() }));

vi.mock("mermaid", () => ({
  default: { initialize: vi.fn(), render: renderMock },
}));

vi.mock("remotion", () => ({
  Easing: { out: () => (t: number) => t, cubic: (t: number) => t },
  interpolate: () => 1,
}));

function diagramScene(mermaid: string): KtScene {
  return {
    id: 1,
    type: "architecture",
    file_path: null,
    title: "Auth Flow",
    code: "",
    highlight_lines: [1, 1],
    narration_text: "",
    sentences: [],
    focus_symbols: [],
    durationInFrames: 180,
    startFrame: 0,
    endFrame: 180,
    mermaid,
  };
}

describe("DiagramPanel", () => {
  beforeEach(() => {
    renderMock.mockReset();
  });

  it("shows the rendered SVG once mermaid resolves", async () => {
    renderMock.mockResolvedValue({ svg: '<svg data-testid="ok"></svg>' });

    render(
      <DiagramPanel
        scene={diagramScene("graph TD; A-->B")}
        relativeFrame={0}
      />,
    );

    expect(screen.getByText("Rendering diagram…")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("ok")).toBeInTheDocument());
  });

  it("says so when mermaid rejects the source instead of spinning forever", async () => {
    renderMock.mockRejectedValue(new Error("Parse error"));

    render(
      <DiagramPanel scene={diagramScene("graph TD; A-->")} relativeFrame={0} />,
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This diagram couldn't be rendered from its source.",
      ),
    );
    expect(screen.queryByText("Rendering diagram…")).not.toBeInTheDocument();
  });

  it("does not re-run a render that already failed when the scene remounts", async () => {
    renderMock.mockRejectedValue(new Error("Parse error"));
    const scene = diagramScene("graph TD; broken -->");

    const first = render(<DiagramPanel scene={scene} relativeFrame={0} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    first.unmount();

    // Remotion remounts a scene on every playback loop.
    render(<DiagramPanel scene={scene} relativeFrame={0} />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
