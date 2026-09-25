import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ProvisioningCard } from "#/components/features/kt-video/provisioning-card";

// Every step label and the status/failed sentences are real translation
// keys now (see provisioning-card.tsx) instead of hardcoded English, so the
// global i18n mock's plain key passthrough would collapse every step's
// status line to the same string regardless of which step/label/counts it
// carries. Mirrors the interpolation-aware local mock other components with
// parameterized strings use (e.g. file-list-truncated-notice.test.tsx):
// echo the key plus its params so assertions can still tell steps apart.
vi.mock("react-i18next", async () => {
  const actual = await vi.importActual("react-i18next");
  return {
    ...(actual as object),
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        options
          ? `${key}(${Object.entries(options)
              .map(([k, v]) => `${k}=${v}`)
              .join(",")})`
          : key,
      i18n: { language: "en" },
    }),
  };
});

function stepIcons(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLDivElement>(
      ".flex.items-center.gap-2.text-xs",
    ),
  ).map((row) => row.querySelector("svg"));
}

function iconIs(svg: SVGSVGElement | null, slug: string) {
  return !!svg && svg.classList.contains(`lucide-${slug}`);
}

describe("ProvisioningCard", () => {
  it("shows only the steps DeepWiki actually reached as done when it fails mid-indexing", () => {
    // Regression test: resolveStepIndex used to always resolve "failed" to
    // the last step, which rendered every earlier step (including ones the
    // task never got to) with a false "done" checkmark.
    const { container } = render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="failed"
        lastNonTerminalStatus="indexing"
        error="Indexing crashed"
      />,
    );

    const icons = stepIcons(container);
    // Setting up workspace / Resolving repository: really done.
    expect(iconIs(icons[0], "circle-check")).toBe(true);
    expect(iconIs(icons[1], "circle-check")).toBe(true);
    // Indexing codebase: where it actually failed.
    expect(iconIs(icons[2], "circle-alert")).toBe(true);
    // Understanding structure / Writing knowledge: never reached, must not
    // be marked done.
    expect(iconIs(icons[3], "circle-check")).toBe(false);
    expect(iconIs(icons[4], "circle-check")).toBe(false);
    expect(iconIs(icons[3], "circle")).toBe(true);
    expect(iconIs(icons[4], "circle")).toBe(true);
  });

  it("falls back to the earliest DeepWiki-backed step when no prior status was ever recorded", () => {
    const { container } = render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="failed"
        lastNonTerminalStatus={null}
        error="Failed immediately"
      />,
    );

    const icons = stepIcons(container);
    expect(iconIs(icons[2], "circle-alert")).toBe(true);
    expect(iconIs(icons[3], "circle-check")).toBe(false);
  });

  it("still marks every earlier step done while actively generating", () => {
    const { container } = render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="generating"
        pagesDone={2}
        pagesTotal={5}
        error={null}
      />,
    );

    const icons = stepIcons(container);
    expect(iconIs(icons[0], "circle-check")).toBe(true);
    expect(iconIs(icons[3], "circle-check")).toBe(true);
    expect(iconIs(icons[4], "loader-circle")).toBe(true);
  });

  it("announces the current step and live page count through an accessible status region", () => {
    // Regression coverage: every step label renders unconditionally with
    // only its icon/color changing, so without a live text region a screen
    // reader user got no signal that provisioning was progressing at all.
    render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="generating"
        pagesDone={3}
        pagesTotal={12}
        error={null}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "KT$PROVISIONING_STEP_STATUS(current=5,total=5,label=KT$PROVISIONING_STEP_WRITING) KT$PROVISIONING_PAGE_COUNT(done=3,total=12)",
    );
  });

  it("stays on the first step for the provisioning stages before DeepWiki has a task", () => {
    // Regression coverage: resolveStepIndex's provisioningStage branch (the
    // two stages that precede DeepWiki even having a task) had no test at
    // all, even though it's the very first thing a user sees.
    for (const stage of [
      "creating_conversation",
      "provisioning_workspace",
    ] as const) {
      const { container, unmount } = render(
        <ProvisioningCard
          owner="acme"
          repo="widgets"
          branch="main"
          provisioningStage={stage}
          deepWikiStatus={null}
          error={null}
        />,
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "KT$PROVISIONING_STEP_STATUS(current=1,total=5,label=KT$PROVISIONING_STEP_WORKSPACE)",
      );
      expect(iconIs(stepIcons(container)[0], "loader-circle")).toBe(true);
      unmount();
    }
  });

  it("advances to the resolving-commit step once the repository is being resolved", () => {
    const { container } = render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage="resolving_commit"
        deepWikiStatus={null}
        error={null}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "KT$PROVISIONING_STEP_STATUS(current=2,total=5,label=KT$PROVISIONING_STEP_REPOSITORY)",
    );
    const icons = stepIcons(container);
    expect(iconIs(icons[0], "circle-check")).toBe(true);
    expect(iconIs(icons[1], "loader-circle")).toBe(true);
  });

  it("marks structure analysis active while DeepWiki is determining structure", () => {
    const { container } = render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="determining_structure"
        error={null}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "KT$PROVISIONING_STEP_STATUS(current=4,total=5,label=KT$PROVISIONING_STEP_STRUCTURE)",
    );
    const icons = stepIcons(container);
    expect(iconIs(icons[2], "circle-check")).toBe(true);
    expect(iconIs(icons[3], "loader-circle")).toBe(true);
    expect(iconIs(icons[4], "circle")).toBe(true);
  });

  it("announces the failure and which step it happened on", () => {
    render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="failed"
        lastNonTerminalStatus="indexing"
        error="Indexing crashed"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "KT$PROVISIONING_STEP_FAILED(label=KT$PROVISIONING_STEP_INDEXING,error=Indexing crashed)",
    );
  });

  it("renders a dismiss control once failed, and calls onDismiss when clicked", async () => {
    // Regression test: a provisioning failure that happens before any
    // conversation is ever created (e.g. createConversation itself rejects)
    // has no other path back to "known" that would otherwise make the card
    // disappear -- without this control it sat on the page forever with no
    // way for the user to clear it short of a full page reload.
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage="creating_conversation"
        deepWikiStatus={null}
        error="Failed to start a conversation"
        onDismiss={onDismiss}
      />,
    );

    const dismissButton = screen.getByTestId("kt-provisioning-dismiss");
    expect(dismissButton).toHaveTextContent("KT$PROVISIONING_DISMISS");
    await user.click(dismissButton);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("never renders a dismiss control while there is no error to clear", () => {
    render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage="creating_conversation"
        deepWikiStatus={null}
        error={null}
        onDismiss={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("kt-provisioning-dismiss"),
    ).not.toBeInTheDocument();
  });

  it("never renders a dismiss control when the caller doesn't supply onDismiss, even on failure", () => {
    render(
      <ProvisioningCard
        owner="acme"
        repo="widgets"
        branch="main"
        provisioningStage={null}
        deepWikiStatus="failed"
        lastNonTerminalStatus="indexing"
        error="Indexing crashed"
      />,
    );

    expect(
      screen.queryByTestId("kt-provisioning-dismiss"),
    ).not.toBeInTheDocument();
  });
});
