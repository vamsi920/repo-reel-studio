import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CodeGraphToolbar } from "#/components/features/codegraph/codegraph-toolbar";
import type { CodeGraphNode } from "#/lib/codegraph/codegraph-types";
import type { SearchEntry } from "#/lib/codegraph/analyzer-runner";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

function node(id: string, type = "file"): CodeGraphNode {
  return {
    id,
    level: "unit",
    type,
    name: id,
    summary: "",
    complexity: "simple",
    tags: [],
    childCount: 0,
    filePaths: [],
  };
}

const CRUMBS = [
  { id: null, name: "System" },
  { id: "subsystem:pay", name: "Payment Service" },
  { id: "subsystem:pay/module:processing", name: "Processing" },
];

function renderToolbar(
  overrides: Partial<Parameters<typeof CodeGraphToolbar>[0]> = {},
) {
  const props = {
    crumbs: CRUMBS,
    nodeCount: 10,
    visibleCount: 10,
    types: ["file", "class"],
    hiddenTypes: [] as string[],
    onToggleType: vi.fn(),
    onNavigate: vi.fn(),
    searchQuery: "",
    onSearchChange: vi.fn(),
    searchResults: [] as SearchEntry[],
    onSelectResult: vi.fn(),
    levelNodes: [node("a"), node("b")],
    ...overrides,
  };
  render(<CodeGraphToolbar {...props} />);
  return props;
}

describe("CodeGraphToolbar", () => {
  it("shows the full path from the system root to the current level", () => {
    renderToolbar();
    const nav = screen.getByTestId("codegraph-breadcrumbs");

    expect(nav).toHaveTextContent("System");
    expect(nav).toHaveTextContent("Payment Service");
    expect(nav).toHaveTextContent("Processing");
  });

  it("navigates to an ancestor when its crumb is clicked", async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByText("Payment Service"));

    expect(props.onNavigate).toHaveBeenCalledWith("subsystem:pay");
  });

  it("disables the crumb for the level already on screen", () => {
    renderToolbar();

    expect(screen.getByText("Processing")).toBeDisabled();
    expect(screen.getByText("System")).toBeEnabled();
  });

  it("goes back to the immediate parent, not the root", async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByTestId("codegraph-back"));

    expect(props.onNavigate).toHaveBeenCalledWith("subsystem:pay");
  });

  it("hides Back at the system view, which has nowhere to go", () => {
    renderToolbar({ crumbs: [{ id: null, name: "System" }] });

    expect(screen.queryByTestId("codegraph-back")).not.toBeInTheDocument();
  });

  it("reports a plain node count when nothing is filtered", () => {
    renderToolbar({ nodeCount: 10, visibleCount: 10 });

    expect(screen.getByTestId("codegraph-node-count")).toHaveTextContent(
      "CODEGRAPH$NODES",
    );
  });

  it("reports how many nodes the filter is hiding", () => {
    renderToolbar({ nodeCount: 10, visibleCount: 4 });

    expect(screen.getByTestId("codegraph-node-count")).toHaveTextContent(
      '{"visible":4,"total":10}',
    );
  });

  it("toggles a node type from the filter panel", async () => {
    const user = userEvent.setup();
    const props = renderToolbar();

    await user.click(screen.getByTestId("codegraph-filters-toggle"));
    await user.click(screen.getByRole("button", { name: "class" }));

    expect(props.onToggleType).toHaveBeenCalledWith("class");
  });

  it("marks a hidden type as switched off", async () => {
    const user = userEvent.setup();
    renderToolbar({ hiddenTypes: ["class"] });

    await user.click(screen.getByTestId("codegraph-filters-toggle"));

    expect(screen.getByRole("button", { name: "class" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "file" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("keeps the filter panel closed until asked for", () => {
    renderToolbar();

    expect(screen.queryByTestId("codegraph-filters")).not.toBeInTheDocument();
  });

  it("shows search results only while there is a query", () => {
    const results: SearchEntry[] = [
      {
        id: "function:src/pay/charge.ts:chargeCard",
        name: "chargeCard",
        type: "function",
        filePath: "src/pay/charge.ts",
        parentId: "file:src/pay/charge.ts",
        level: "symbol",
      },
    ];

    const { rerender } = render(
      <CodeGraphToolbar
        crumbs={CRUMBS}
        nodeCount={1}
        visibleCount={1}
        types={[]}
        hiddenTypes={[]}
        onToggleType={vi.fn()}
        onNavigate={vi.fn()}
        searchQuery=""
        onSearchChange={vi.fn()}
        searchResults={results}
        onSelectResult={vi.fn()}
        levelNodes={[]}
      />,
    );

    expect(
      screen.queryByTestId("codegraph-search-results"),
    ).not.toBeInTheDocument();

    rerender(
      <CodeGraphToolbar
        crumbs={CRUMBS}
        nodeCount={1}
        visibleCount={1}
        types={[]}
        hiddenTypes={[]}
        onToggleType={vi.fn()}
        onNavigate={vi.fn()}
        searchQuery="charge"
        onSearchChange={vi.fn()}
        searchResults={results}
        onSelectResult={vi.fn()}
        levelNodes={[]}
      />,
    );

    expect(screen.getByTestId("codegraph-search-results")).toHaveTextContent(
      "chargeCard",
    );
  });

  it("hands the chosen search hit back so the graph can navigate to it", async () => {
    const user = userEvent.setup();
    const entry: SearchEntry = {
      id: "function:src/pay/charge.ts:chargeCard",
      name: "chargeCard",
      type: "function",
      filePath: "src/pay/charge.ts",
      parentId: "file:src/pay/charge.ts",
      level: "symbol",
    };
    const props = renderToolbar({
      searchQuery: "charge",
      searchResults: [entry],
    });

    await user.click(screen.getByText("chargeCard"));

    expect(props.onSelectResult).toHaveBeenCalledWith(entry);
  });
});
