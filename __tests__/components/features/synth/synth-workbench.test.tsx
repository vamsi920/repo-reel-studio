import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { SynthWorkbench } from "#/components/features/synth/studio/synth-workbench";
import { useSynthStudioStore } from "#/stores/synth-studio-store";
import { runGeneration, type GenerateRequest } from "#/services/synth-control";
import { parseSchemaFile } from "#/lib/synth/parsers";
import { PRISMA_SHOP } from "../../../lib/synth/fixtures";

// The live box reads conversation metrics through the websocket/query stack.
vi.mock("#/hooks/use-live-conversation-metrics", () => ({
  useLiveConversationMetrics: () => ({
    cost: null,
    usage: null,
    max_budget_per_task: null,
  }),
}));
vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { sendMessage: vi.fn().mockResolvedValue(undefined) } }),
);

describe("SynthWorkbench", () => {
  let projectId: string;
  beforeEach(() => {
    const store = useSynthStudioStore.getState();
    store.reset();
    projectId = store.createProject({
      name: "shop",
      source: { kind: "folder", name: "/work/shop" },
    }).id;
  });

  function render(onGenerate: (r: GenerateRequest) => void = vi.fn()) {
    return renderWithProviders(
      <SynthWorkbench
        projectId={projectId}
        postResult={vi.fn()}
        onGenerate={onGenerate}
        busy={false}
      />,
    );
  }

  it("shows the empty model with an import affordance and no generate controls", () => {
    render();
    expect(screen.getByTestId("synth-model")).toBeInTheDocument();
    expect(screen.getByTestId("synth-import-button")).toBeInTheDocument();
    expect(screen.queryByTestId("synth-generate")).not.toBeInTheDocument();
    expect(screen.getByTestId("synth-status")).toHaveAttribute(
      "data-status",
      "intake",
    );
  });

  it("renders the model, lets the user change a field's meaning, and a run with its preview after Generate", async () => {
    useSynthStudioStore
      .getState()
      .upsertEntities(
        projectId,
        parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
      );
    const onGenerate = vi.fn(async (request: GenerateRequest) => {
      await runGeneration(
        projectId,
        { ...request, seed: 5 },
        { triggeredBy: "user" },
      );
    });
    render(onGenerate);

    expect(screen.getByTestId("synth-stat-entities")).toHaveTextContent("6");
    expect(screen.getByTestId("synth-stat-relations")).toHaveTextContent("6");
    fireEvent.click(screen.getByTestId("synth-entity-toggle-user"));
    const semantic = screen.getByTestId(
      "synth-semantic-user-phone",
    ) as HTMLSelectElement;
    expect(semantic.value).toBe("phone");
    fireEvent.change(semantic, { target: { value: "generic" } });
    expect(
      useSynthStudioStore
        .getState()
        .projects[projectId].model.entities.find((e) => e.id === "user")
        ?.fields.find((f) => f.name === "phone")?.semantic,
    ).toBe("generic");

    // Pick the edge-case scenario and generate.
    fireEvent.click(screen.getByTestId("synth-scenario-edge_cases"));
    fireEvent.click(screen.getByTestId("synth-format-csv"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("synth-generate-button"));
    });
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioId: "edge_cases" }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("synth-runs")).toBeInTheDocument(),
    );
    const project = useSynthStudioStore.getState().projects[projectId];
    const run = project.runs[0];
    expect(run.validation.ok).toBe(true);
    const runNode = screen.getByTestId(`synth-run-${run.id}`);
    expect(runNode).toHaveAttribute("data-valid", "true");
    expect(
      within(runNode).getByTestId("synth-preview-table"),
    ).toBeInTheDocument();
    expect(
      within(runNode).getByTestId(`synth-download-all-${run.id}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("synth-stat-rows")).toHaveTextContent(
      run.rowsTotal.toLocaleString(),
    );
    expect(screen.getByTestId("synth-privacy")).toBeInTheDocument();
  });

  it("surfaces an open question above the generate controls and marks it answered on confirm", () => {
    const store = useSynthStudioStore.getState();
    store.upsertEntities(
      projectId,
      parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
    );
    store.askQuestion(projectId, {
      id: "purpose",
      title: "What is the data for?",
      kind: "single",
      options: [
        { id: "tests", label: "Tests", recommended: true },
        { id: "demo", label: "Demo" },
      ],
      allowOther: true,
      status: "open",
      selected: [],
      at: "2026-10-21T12:00:00Z",
    });
    const postResult = vi.fn();
    renderWithProviders(
      <SynthWorkbench
        projectId={projectId}
        postResult={postResult}
        onGenerate={vi.fn()}
        busy={false}
      />,
    );
    const keys = Array.from(document.querySelectorAll("[data-card-key]")).map(
      (el) => el.getAttribute("data-card-key"),
    );
    expect(keys.indexOf("question-purpose")).toBeLessThan(
      keys.indexOf("generate"),
    );
    expect(screen.getByTestId("synth-status")).toHaveAttribute(
      "data-status",
      "intake",
    );
    fireEvent.click(screen.getByTestId("synth-option-purpose-tests"));
    fireEvent.click(screen.getByTestId("synth-confirm-purpose"));
    expect(screen.getByTestId("synth-question-purpose")).toHaveAttribute(
      "data-status",
      "answered",
    );
    expect(postResult).toHaveBeenCalledTimes(1);
    expect(postResult.mock.calls[0][0]).toContain('"question_id":"purpose"');
    expect(postResult.mock.calls[0][0]).toContain('"selected":["tests"]');
  });

  it("disables Generate while the model has a broken reference and lists the problem", () => {
    useSynthStudioStore.getState().upsertEntities(projectId, [
      {
        id: "order",
        name: "Order",
        evidence: [],
        fields: [
          { name: "id", type: "integer", primaryKey: true },
          {
            name: "user_id",
            type: "integer",
            references: { entity: "user", field: "id" },
          },
        ],
      },
    ]);
    render();
    expect(screen.getByTestId("synth-model-problems")).toHaveTextContent(
      "order.user_id: references unknown entity user",
    );
    expect(screen.getByTestId("synth-generate-button")).toBeDisabled();
  });

  it("lets the user mark a column personal and choose masking, and edit its context", () => {
    useSynthStudioStore
      .getState()
      .upsertEntities(
        projectId,
        parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
      );
    render();
    fireEvent.click(screen.getByTestId("synth-entity-toggle-product"));
    // sku is not personal: no treatment to pick until the user says it is.
    expect(
      screen.queryByTestId("synth-treatment-product-sku"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("synth-pii-product-sku"), {
      target: { value: "direct" },
    });
    fireEvent.change(screen.getByTestId("synth-treatment-product-sku"), {
      target: { value: "mask" },
    });
    const sku = () =>
      useSynthStudioStore
        .getState()
        .projects[projectId].model.entities.find((e) => e.id === "product")!
        .fields.find((f) => f.name === "sku")!;
    expect(sku()).toMatchObject({ pii: "direct", treatment: "mask" });

    fireEvent.click(screen.getByTestId("synth-field-edit-product-title"));
    fireEvent.change(screen.getByTestId("synth-field-examples-product-title"), {
      target: { value: "Lamp, Desk" },
    });
    fireEvent.blur(screen.getByTestId("synth-field-examples-product-title"));
    expect(
      useSynthStudioStore
        .getState()
        .projects[projectId].model.entities.find((e) => e.id === "product")!
        .fields.find((f) => f.name === "title")!.examples,
    ).toEqual(["Lamp", "Desk"]);
  });

  it("spreads a typed total over the tables and says when it is capped", async () => {
    useSynthStudioStore
      .getState()
      .upsertEntities(
        projectId,
        parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
      );
    const onGenerate = vi.fn();
    render(onGenerate);
    fireEvent.change(screen.getByTestId("synth-total-rows"), {
      target: { value: "1,000" },
    });
    expect(screen.getByTestId("synth-total-rows-hint")).toHaveAttribute(
      "data-capped",
      "false",
    );
    fireEvent.click(screen.getByTestId("synth-generate-button"));
    expect(onGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ totalRows: 1000 }),
    );
    fireEvent.change(screen.getByTestId("synth-total-rows"), {
      target: { value: "10000000" },
    });
    expect(screen.getByTestId("synth-total-rows-hint")).toHaveAttribute(
      "data-capped",
      "true",
    );
  });

  it("offers an expand toggle when the layout allows it, and opens a run in a full-screen view", async () => {
    useSynthStudioStore
      .getState()
      .upsertEntities(
        projectId,
        parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
      );
    await runGeneration(
      projectId,
      { scenarioId: "smoke", seed: 2 },
      { triggeredBy: "user" },
    );
    const onToggleExpand = vi.fn();
    renderWithProviders(
      <SynthWorkbench
        projectId={projectId}
        postResult={vi.fn()}
        onGenerate={vi.fn()}
        busy={false}
        onToggleExpand={onToggleExpand}
      />,
    );
    fireEvent.click(screen.getByTestId("synth-expand-toggle"));
    expect(onToggleExpand).toHaveBeenCalledTimes(1);

    const run = useSynthStudioStore.getState().projects[projectId].runs[0];
    fireEvent.click(screen.getByTestId(`synth-full-view-${run.id}`));
    const viewer = await screen.findByTestId("synth-data-viewer");
    expect(
      within(viewer).getByTestId("synth-data-viewer-table"),
    ).toBeInTheDocument();
    expect(
      within(viewer).queryByTestId("synth-data-viewer-preview-only"),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByTestId("synth-data-viewer")).not.toBeInTheDocument(),
    );
  });

  it("masks a loaded CSV export in the browser using the model's choices", async () => {
    useSynthStudioStore
      .getState()
      .upsertEntities(
        projectId,
        parseSchemaFile("schema.prisma", PRISMA_SHOP).entities,
      );
    render();
    fireEvent.change(screen.getByTestId("synth-mask-entity"), {
      target: { value: "user" },
    });
    const file = new File(
      ["id,email,phone\n1,real.person@corp.com,+15551234567\n"],
      "users.csv",
      { type: "text/csv" },
    );
    fireEvent.change(screen.getByTestId("synth-mask-input"), {
      target: { files: [file] },
    });
    const result = await screen.findByTestId("synth-mask-result");
    expect(
      within(result).queryByText("real.person@corp.com"),
    ).not.toBeInTheDocument();
    expect(
      within(result).getByTestId("synth-preview-table"),
    ).toBeInTheDocument();
    expect(
      within(result).getByTestId("synth-mask-download-csv"),
    ).toBeInTheDocument();
  });

  it("imports sample rows from disk, learns the table without keeping personal values, and tells the agent", async () => {
    const postResult = vi.fn();
    renderWithProviders(
      <SynthWorkbench
        projectId={projectId}
        postResult={postResult}
        onGenerate={vi.fn()}
        busy={false}
      />,
    );
    const csv =
      "id,contact,plan\n1,ann@corp.com,gold\n2,bob@corp.com,free\n3,cy@corp.com,gold\n4,dee@corp.com,free\n5,eve@corp.com,gold\n";
    fireEvent.change(screen.getByTestId("synth-import-input"), {
      target: { files: [new File([csv], "members.csv", { type: "text/csv" })] },
    });
    await waitFor(() =>
      expect(
        useSynthStudioStore.getState().projects[projectId].model.entities,
      ).toHaveLength(1),
    );
    expect(screen.getByTestId("synth-import-note")).toBeInTheDocument();
    const entity =
      useSynthStudioStore.getState().projects[projectId].model.entities[0];
    expect(entity.fields.find((f) => f.name === "contact")?.semantic).toBe(
      "email",
    );
    expect(JSON.stringify(entity)).not.toContain("ann@corp.com");
    expect(postResult).toHaveBeenCalledTimes(1);
    expect(postResult.mock.calls[0][0]).toContain(
      '"status":"imported_by_user"',
    );
  });

  it("adds a requirements document: the model, the coverage and a receipt for the agent", async () => {
    const postResult = vi.fn();
    renderWithProviders(
      <SynthWorkbench
        projectId={projectId}
        postResult={postResult}
        onGenerate={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByTestId("synth-documents")).toBeInTheDocument();
    const brd = [
      "BR-1: Each customer can have many orders.",
      "BR-2: The order total must be between 1 and 999.",
      "BR-3: Orders are archived after a year.",
    ].join("\n");
    const file = new File([brd], "orders-brd.md", { type: "text/markdown" });
    await act(async () => {
      fireEvent.change(screen.getByTestId("synth-documents-input"), {
        target: { files: [file] },
      });
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("synth-document-orders_brd"),
      ).toBeInTheDocument(),
    );
    const project = useSynthStudioStore.getState().projects[projectId];
    expect(project.model.entities.map((e) => e.id).sort()).toEqual([
      "customer",
      "order",
    ]);
    // Two of three requirements are in the model; BR-3 is the gap.
    expect(
      within(screen.getByTestId("synth-coverage")).getByRole("progressbar"),
    ).toHaveAttribute("aria-valuenow", "67");
    const gaps = within(
      screen.getByTestId("synth-coverage-list"),
    ).getAllByTestId("synth-requirement");
    expect(gaps.map((g) => g.getAttribute("data-covered"))).toEqual(["false"]);
    expect(String(postResult.mock.calls[0][0])).toContain(
      "document_added_by_user",
    );
  });
});
