import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RepoTreePanel } from "#/components/features/kt-video/repo-tree-panel";
import type { KtScene } from "#/lib/kt-video/build-manifest";

vi.mock("remotion", () => ({
  Easing: { out: () => (t: number) => t, cubic: (t: number) => t },
  interpolate: () => 1,
}));

function treeScene(overrides: Partial<KtScene> = {}): KtScene {
  return {
    id: 1,
    type: "repo-tree",
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
    ...overrides,
  };
}

describe("RepoTreePanel", () => {
  it("renders each file's base name, indented by its real path depth", () => {
    render(
      <RepoTreePanel
        scene={treeScene({
          tree_files: ["src/index.ts", "src/lib/util/helper.ts"],
        })}
        relativeFrame={20}
      />,
    );

    const shallow = screen.getByText("index.ts");
    const deep = screen.getByText("helper.ts");
    const shallowDepth = Number(shallow.style.paddingLeft.replace("px", ""));
    const deepDepth = Number(deep.style.paddingLeft.replace("px", ""));

    expect(deepDepth).toBeGreaterThan(shallowDepth);
  });

  it("exposes the file list to assistive tech as a labelled list", () => {
    render(
      <RepoTreePanel
        scene={treeScene({
          title: "Auth Flow",
          tree_files: ["src/index.ts", "src/lib/util/helper.ts"],
        })}
        relativeFrame={20}
      />,
    );

    const list = screen.getByRole("list", {
      name: "Repository files for Auth Flow",
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(list).toContainElement(screen.getByText("index.ts"));
  });

  it("shows no overflow line when every in-scope file is listed", () => {
    render(
      <RepoTreePanel
        scene={treeScene({ tree_files: ["src/index.ts"] })}
        relativeFrame={20}
      />,
    );

    expect(screen.queryByText(/more file/)).not.toBeInTheDocument();
  });

  it("reports the real overflow count, singular for exactly one extra file", () => {
    render(
      <RepoTreePanel
        scene={treeScene({ tree_files: ["src/index.ts"], tree_overflow: 1 })}
        relativeFrame={20}
      />,
    );

    expect(screen.getByText("+1 more file in scope")).toBeInTheDocument();
  });

  it("pluralizes the overflow count for more than one extra file", () => {
    render(
      <RepoTreePanel
        scene={treeScene({ tree_files: ["src/index.ts"], tree_overflow: 4 })}
        relativeFrame={20}
      />,
    );

    expect(screen.getByText("+4 more files in scope")).toBeInTheDocument();
  });

  it("names the real shown/total split in the list's accessible name when files overflow", () => {
    render(
      <RepoTreePanel
        scene={treeScene({
          title: "Auth Flow",
          tree_files: ["src/index.ts"],
          tree_overflow: 4,
        })}
        relativeFrame={20}
      />,
    );

    // Without this, a screen-reader user only hears the one listed item —
    // the "+4 more" line is sighted-only text outside the list's own name.
    expect(
      screen.getByRole("list", {
        name: "Repository files for Auth Flow, showing 1 of 5",
      }),
    ).toBeInTheDocument();
  });

  it("renders nothing but the frame when a scene has no tree files at all", () => {
    render(
      <RepoTreePanel
        scene={treeScene({ tree_files: undefined })}
        relativeFrame={20}
      />,
    );

    expect(screen.queryByText(/more file/)).not.toBeInTheDocument();
  });
});
