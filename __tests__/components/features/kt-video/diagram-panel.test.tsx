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
    expect(
      screen.getByRole("img", { name: "Auth Flow diagram" }),
    ).toBeInTheDocument();
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

  it("shows a neutral message instead of the error banner when the scene has no diagram source", () => {
    render(
      <DiagramPanel scene={diagramScene("")} relativeFrame={0} />,
    );

    expect(
      screen.getByText("No diagram source for this scene."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(renderMock).not.toHaveBeenCalled();
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

  it("evicts the oldest cached diagram once the cache is full, instead of growing forever", async () => {
    // The cache is a module-level Map with no eviction otherwise — a long
    // session that pages through many repositories/knowledge pages would
    // hold every unique diagram source it ever rendered for as long as the
    // tab stays open. Cap it and re-render the oldest source to prove it was
    // actually evicted (mermaid gets called again for it), not just that new
    // sources keep working.
    renderMock.mockImplementation((_renderId: string, source: string) =>
      Promise.resolve({ svg: `<svg data-testid="rendered">${source}</svg>` }),
    );

    const first = render(
      <DiagramPanel scene={diagramScene("graph TD; first")} relativeFrame={0} />,
    );
    await waitFor(() => expect(screen.getByTestId("rendered")).toBeInTheDocument());
    first.unmount();

    for (let i = 0; i < 30; i += 1) {
      const filler = render(
        <DiagramPanel
          scene={diagramScene(`graph TD; filler-${i}`)}
          relativeFrame={0}
        />,
      );
      // eslint-disable-next-line no-await-in-loop -- each render must settle before the next fills the cache
      await waitFor(() =>
        expect(screen.getByTestId("rendered")).toBeInTheDocument(),
      );
      filler.unmount();
    }

    renderMock.mockClear();
    render(
      <DiagramPanel scene={diagramScene("graph TD; first")} relativeFrame={0} />,
    );

    await waitFor(() => expect(renderMock).toHaveBeenCalledTimes(1));
  });

  it("removes mermaid's own stray error-banner nodes after a failed render", async () => {
    // Regression coverage for the cleanup in useMermaidSvg's catch handler:
    // mermaid's real error handler draws into a node it creates itself for
    // the render (id `d<renderId>`, plus the bare `<renderId>` node) but
    // never removes on a parse failure. Left alone, that stray banner lingers
    // in the DOM outside this component after we've already shown our own
    // error message.
    let capturedRenderId = "";
    renderMock.mockImplementation((renderId: string) => {
      capturedRenderId = renderId;
      const wrapper = document.createElement("div");
      wrapper.id = `d${renderId}`;
      document.body.appendChild(wrapper);
      const bare = document.createElement("div");
      bare.id = renderId;
      document.body.appendChild(bare);
      return Promise.reject(new Error("Parse error"));
    });

    render(
      <DiagramPanel
        scene={diagramScene("graph TD; stray-cleanup -->")}
        relativeFrame={0}
      />,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    expect(capturedRenderId).not.toBe("");
    expect(document.getElementById(`d${capturedRenderId}`)).toBeNull();
    expect(document.getElementById(capturedRenderId)).toBeNull();
  });
});
