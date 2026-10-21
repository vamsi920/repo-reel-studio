import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";
import { ModernizationWorkbench } from "#/components/features/modernization/studio/modernization-workbench";
import {
  useModernizationStudioStore,
  type ChoiceQuestion,
} from "#/stores/modernization-studio-store";

// The live box reads conversation metrics through the websocket/query
// stack; this suite is about ordering, so it renders a stand-in.
vi.mock(
  "#/components/features/modernization/studio/live-migration-card",
  () => ({ LiveMigrationCard: () => <div data-testid="neome-live" /> }),
);

function question(
  id: string,
  at: string,
  status: ChoiceQuestion["status"],
): ChoiceQuestion {
  return {
    id,
    title: id,
    kind: "single",
    options: [
      { id: "fastapi", label: "FastAPI", description: "FastAPI" },
      { id: "flask", label: "Flask", description: "Keep Flask" },
    ],
    allowOther: false,
    status,
    selected: status === "answered" ? ["fastapi"] : [],
    at,
  };
}

describe("ModernizationWorkbench", () => {
  let projectId: string;
  beforeEach(() => {
    const store = useModernizationStudioStore.getState();
    store.reset();
    projectId = store.createProject({
      name: "app",
      source: { kind: "folder", name: "/work/app" },
    }).id;
    store.askQuestion(
      projectId,
      question("backend", "2026-10-20T10:00:00Z", "answered"),
    );
    store.askQuestion(
      projectId,
      question("frontend", "2026-10-20T10:05:00Z", "open"),
    );
    store.askQuestion(
      projectId,
      question("database", "2026-10-20T10:02:00Z", "answered"),
    );
    store.requestApproval(projectId, {
      id: "go",
      what: "Start building",
      status: "approved",
      at: "2026-10-20T10:03:00Z",
    });
  });

  it("puts status first and decisions in the order they were asked, newest open one last", () => {
    renderWithProviders(
      <ModernizationWorkbench
        projectId={projectId}
        postResult={vi.fn()}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        busy={false}
      />,
    );

    const order = Array.from(
      screen
        .getByTestId("neome-workbench-scroll")
        .querySelectorAll("[data-card-key]"),
    ).map((el) => el.getAttribute("data-card-key"));

    expect(order).toEqual([
      "live",
      "plan",
      "stack",
      "question-backend",
      "question-database",
      "approval-go",
      "question-frontend",
    ]);
  });

  it("hides an option description that only repeats its label", () => {
    renderWithProviders(
      <ModernizationWorkbench
        projectId={projectId}
        postResult={vi.fn()}
        onStart={vi.fn()}
        onPause={vi.fn()}
        onResume={vi.fn()}
        busy={false}
      />,
    );

    const open = screen.getByTestId("neome-question-frontend");
    expect(open.textContent).toContain("Keep Flask");
    expect(open.textContent?.match(/FastAPI/g)).toHaveLength(1);
  });

  it("returns to the live box once the last waiting card is answered", () => {
    vi.useFakeTimers();
    const scrolled: (string | null)[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function scrollIntoView() {
      scrolled.push(
        (this as Element)
          .closest("[data-card-key]")
          ?.getAttribute("data-card-key") ?? null,
      );
    };
    try {
      renderWithProviders(
        <ModernizationWorkbench
          projectId={projectId}
          postResult={vi.fn()}
          onStart={vi.fn()}
          onPause={vi.fn()}
          onResume={vi.fn()}
          busy={false}
        />,
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(scrolled.at(-1)).toBe("question-frontend");

      act(() => {
        useModernizationStudioStore
          .getState()
          .answerQuestion(projectId, "frontend", ["fastapi"]);
      });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(scrolled.at(-1)).toBe("live");
    } finally {
      Element.prototype.scrollIntoView = original;
      vi.useRealTimers();
    }
  });
});
