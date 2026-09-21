import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  CodeGraphCanvas,
  edgesForVisibleNodes,
} from "#/components/features/codegraph/codegraph-canvas";
import type {
  CodeGraphEdge,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";

// React Flow measures nodes and the viewport through browser APIs jsdom does
// not ship. These are the stubs its own testing guide recommends.
beforeAll(() => {
  class MockDOMMatrixReadOnly {
    m22: number;

    constructor(transform?: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? Number(scale) : 1;
    }
  }
  vi.stubGlobal("DOMMatrixReadOnly", MockDOMMatrixReadOnly);
  Object.defineProperties(window.HTMLElement.prototype, {
    offsetHeight: { configurable: true, get: () => 40 },
    offsetWidth: { configurable: true, get: () => 200 },
  });
  (
    globalThis.SVGElement.prototype as unknown as { getBBox: () => DOMRect }
  ).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
});

function node(overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: "file:src/pay/charge.ts",
    level: "unit",
    type: "file",
    name: "charge.ts",
    summary: "",
    complexity: "simple",
    tags: [],
    filePath: "src/pay/charge.ts",
    childCount: 0,
    filePaths: ["src/pay/charge.ts"],
    ...overrides,
  };
}

const FOLDER = node({
  id: "module:src/pay",
  level: "module",
  type: "module",
  name: "pay",
  filePath: "src/pay",
  childCount: 3,
  filePaths: ["src/pay/charge.ts"],
});
const LEAF = node();
const EDGES: CodeGraphEdge[] = [
  { source: FOLDER.id, target: LEAF.id, type: "imports", weight: 1 },
];

async function renderCanvas(
  props: Partial<React.ComponentProps<typeof CodeGraphCanvas>> = {},
) {
  const onSelect = vi.fn();
  const onDrillDown = vi.fn();
  render(
    <div style={{ width: 800, height: 600 }}>
      <CodeGraphCanvas
        nodes={[FOLDER, LEAF]}
        edges={EDGES}
        selectedNodeId={null}
        highlightedIds={new Set()}
        onSelect={onSelect}
        onDrillDown={onDrillDown}
        {...props}
      />
    </div>,
  );
  // Nodes only appear once the async ELK layout has resolved.
  await waitFor(() =>
    expect(screen.getByTestId(`rf__node-${LEAF.id}`)).toBeInTheDocument(),
  );
  return { onSelect, onDrillDown };
}

describe("edgesForVisibleNodes", () => {
  // The type filter panel narrows the canvas's `nodes` prop without touching
  // `edges` — a level's edge list still names every relationship, including
  // ones to a now-hidden node type. Handing that stale edge to React Flow
  // anyway leaves a dangling edge with no node to attach to.
  it("keeps only edges whose source and target are both visible", () => {
    const edges: CodeGraphEdge[] = [
      { source: "a", target: "b", type: "imports", weight: 1 },
      { source: "a", target: "hidden", type: "imports", weight: 1 },
      { source: "hidden", target: "b", type: "calls", weight: 1 },
    ];
    expect(edgesForVisibleNodes(edges, new Set(["a", "b"]))).toEqual([
      edges[0],
    ]);
  });

  it("returns an empty list when nothing is visible", () => {
    const edges: CodeGraphEdge[] = [
      { source: "a", target: "b", type: "imports", weight: 1 },
    ];
    expect(edgesForVisibleNodes(edges, new Set())).toEqual([]);
  });
});

describe("CodeGraphCanvas keyboard access", () => {
  it("labels each focusable node with its name", async () => {
    await renderCanvas();
    const wrapper = screen.getByTestId(`rf__node-${FOLDER.id}`);
    expect(wrapper).toHaveAttribute("tabindex", "0");
    expect(wrapper).toHaveAttribute("aria-label", "pay");
  });

  it("drills into a node with children on Enter", async () => {
    const user = userEvent.setup();
    const { onSelect, onDrillDown } = await renderCanvas();
    screen.getByTestId(`rf__node-${FOLDER.id}`).focus();
    await user.keyboard("{Enter}");
    expect(onDrillDown).toHaveBeenCalledWith(FOLDER.id);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects a leaf node on Space", async () => {
    const user = userEvent.setup();
    const { onSelect, onDrillDown } = await renderCanvas();
    screen.getByTestId(`rf__node-${LEAF.id}`).focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledWith(LEAF.id);
    expect(onDrillDown).not.toHaveBeenCalled();
  });

  it("clears the selection on Escape", async () => {
    const user = userEvent.setup();
    const { onSelect } = await renderCanvas({ selectedNodeId: LEAF.id });
    screen.getByTestId(`rf__node-${LEAF.id}`).focus();
    await user.keyboard("{Escape}");
    expect(onSelect).toHaveBeenCalledWith("");
  });

  it("ignores Enter on the canvas controls", async () => {
    const user = userEvent.setup();
    const { onSelect, onDrillDown } = await renderCanvas();
    const [control] = screen.getAllByRole("button");
    control.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDrillDown).not.toHaveBeenCalled();
  });
});
