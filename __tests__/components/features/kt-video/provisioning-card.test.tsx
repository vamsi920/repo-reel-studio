import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProvisioningCard } from "#/components/features/kt-video/provisioning-card";

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
      "Step 5 of 5: Writing knowledge (3/12)",
    );
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
      "Indexing codebase failed: Indexing crashed",
    );
  });
});
