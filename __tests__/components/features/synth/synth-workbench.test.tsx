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
});
