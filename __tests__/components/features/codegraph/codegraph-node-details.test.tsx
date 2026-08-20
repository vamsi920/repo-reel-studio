import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { CodeGraphNodeDetails } from "#/components/features/codegraph/codegraph-node-details";
import type {
  CodeGraphEdge,
  CodeGraphNode,
} from "#/lib/codegraph/codegraph-types";
import type { KnowledgeLink } from "#/lib/codegraph/deepwiki-bridge";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function node(overrides: Partial<CodeGraphNode> = {}): CodeGraphNode {
  return {
    id: "file:src/pay/charge.ts",
    level: "unit",
    type: "file",
    name: "charge.ts",
    summary: "Handles card charges.",
    complexity: "simple",
    tags: [],
    filePath: "src/pay/charge.ts",
    childCount: 0,
    filePaths: ["src/pay/charge.ts"],
    ...overrides,
  };
}

const SIBLING_A = node({
  id: "file:src/pay/gateway.ts",
  name: "gateway.ts",
  filePath: "src/pay/gateway.ts",
  filePaths: ["src/pay/gateway.ts"],
});
const SIBLING_B = node({
  id: "file:src/api/routes.ts",
  name: "routes.ts",
  filePath: "src/api/routes.ts",
  filePaths: ["src/api/routes.ts"],
});
const SIBLING_C = node({
  id: "file:src/pay/unrelated.ts",
  name: "unrelated.ts",
  filePath: "src/pay/unrelated.ts",
  filePaths: ["src/pay/unrelated.ts"],
});

const EDGES: CodeGraphEdge[] = [
  // charge.ts depends on gateway.ts
  {
    source: "file:src/pay/charge.ts",
    target: "file:src/pay/gateway.ts",
    type: "imports",
    weight: 1,
  },
  // routes.ts uses charge.ts
  {
    source: "file:src/api/routes.ts",
    target: "file:src/pay/charge.ts",
    type: "imports",
    weight: 1,
  },
];

const LINK: KnowledgeLink = {
  pageId: "payments",
  pageTitle: "Payments",
  readPath: "/kt/acme%2Fapp/payments",
  watchPath: "/kt/acme%2Fapp/payments?view=watch",
};

function renderPanel(
  overrides: Partial<Parameters<typeof CodeGraphNodeDetails>[0]> = {},
) {
  const props = {
    node: node(),
    edges: EDGES,
    siblings: [node(), SIBLING_A, SIBLING_B, SIBLING_C],
    knowledgeLink: null as KnowledgeLink | null,
    onSelect: vi.fn(),
    onDrillDown: vi.fn(),
    onClose: vi.fn(),
    readSource: vi.fn().mockResolvedValue("line one\nline two\nline three"),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <CodeGraphNodeDetails {...props} />
    </MemoryRouter>,
  );
  return props;
}

describe("CodeGraphNodeDetails", () => {
  it("separates what a node depends on from what uses it", () => {
    renderPanel();

    // gateway.ts is downstream, routes.ts is upstream — conflating the two
    // would invert the meaning of every dependency the panel shows.
    const dependencies = screen.getByText(
      "CODEGRAPH$DEPENDENCIES",
    ).parentElement!;
    const usedBy = screen.getByText("CODEGRAPH$USED_BY").parentElement!;

    expect(dependencies).toHaveTextContent("gateway.ts");
    expect(dependencies).not.toHaveTextContent("routes.ts");
    expect(usedBy).toHaveTextContent("routes.ts");
    expect(usedBy).not.toHaveTextContent("gateway.ts");
  });

  it("lists unconnected siblings as related, without repeating dependencies", () => {
    renderPanel();

    const related = screen.getByText("CODEGRAPH$RELATED").parentElement!;

    expect(related).toHaveTextContent("unrelated.ts");
    expect(related).not.toHaveTextContent("gateway.ts");
  });

  it("offers documentation links when a Knowledge page covers the node", () => {
    renderPanel({ knowledgeLink: LINK });

    expect(screen.getByTestId("codegraph-read-docs")).toHaveAttribute(
      "href",
      "/kt/acme%2Fapp/payments",
    );
    expect(screen.getByTestId("codegraph-watch-kt")).toHaveAttribute(
      "href",
      "/kt/acme%2Fapp/payments?view=watch",
    );
    expect(screen.getByText("Payments")).toBeInTheDocument();
  });

  it("shows no documentation link at all when no page covers the node", () => {
    // The brief is explicit: a component DeepWiki has no page for must not get
    // an invented one. Structural facts only.
    renderPanel({ knowledgeLink: null });

    expect(screen.queryByTestId("codegraph-read-docs")).not.toBeInTheDocument();
    expect(screen.queryByTestId("codegraph-watch-kt")).not.toBeInTheDocument();
    expect(screen.queryByText("CODEGRAPH$KNOWLEDGE")).not.toBeInTheDocument();
  });

  it("offers a drill-down only for a node that has children", async () => {
    const user = userEvent.setup();
    const props = renderPanel({
      node: node({ id: "subsystem:pay", level: "subsystem", childCount: 12 }),
    });

    await user.click(screen.getByTestId("codegraph-drill-down"));

    expect(props.onDrillDown).toHaveBeenCalledWith("subsystem:pay");
  });

  it("hides the drill-down for a leaf, which has nothing below it", () => {
    renderPanel({ node: node({ childCount: 0 }) });

    expect(
      screen.queryByTestId("codegraph-drill-down"),
    ).not.toBeInTheDocument();
  });

  it("loads real source on demand for a file node", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByTestId("codegraph-open-source"));

    expect(props.readSource).toHaveBeenCalledWith("src/pay/charge.ts");
    expect(await screen.findByText(/line one/)).toBeInTheDocument();
  });

  it("says the source is unavailable rather than showing an empty box", async () => {
    const user = userEvent.setup();
    // A file cited at analysis time can have moved since.
    renderPanel({ readSource: vi.fn().mockResolvedValue(null) });

    await user.click(screen.getByTestId("codegraph-open-source"));

    expect(
      await screen.findByText("CODEGRAPH$SOURCE_MISSING"),
    ).toBeInTheDocument();
  });

  it("has no source control for an aggregate with no file of its own", () => {
    renderPanel({
      node: node({
        id: "subsystem:pay",
        level: "subsystem",
        filePath: undefined,
        filePaths: ["a.ts", "b.ts"],
      }),
    });

    expect(
      screen.queryByTestId("codegraph-open-source"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("CODEGRAPH$RELEVANT_FILES")).toBeInTheDocument();
  });

  it("lets a neighbour be selected straight from the panel", async () => {
    const user = userEvent.setup();
    const props = renderPanel();

    await user.click(screen.getByText("gateway.ts"));

    expect(props.onSelect).toHaveBeenCalledWith("file:src/pay/gateway.ts");
  });
});
