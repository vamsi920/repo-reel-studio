import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProof } from "@/components/landing/SocialProof";

describe("landing copy and render regressions", () => {
  it("keeps nav anchor targets and updated Agent Ops copy", () => {
    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByText("Walkthrough")).toBeInTheDocument();
    expect(screen.getByText("Graph")).toBeInTheDocument();
    expect(screen.getByText("Repo Q&A")).toBeInTheDocument();
    expect(screen.getByText("Agent Ops")).toBeInTheDocument();
    expect(
      screen.getByText("Agent-grade repo automation with clearer review and lower token waste."),
    ).toBeInTheDocument();

    expect(container.querySelector("#walkthrough")).toBeTruthy();
    expect(container.querySelector("#graph")).toBeTruthy();
    expect(container.querySelector("#qa")).toBeTruthy();
    expect(container.querySelector("#agent-ops")).toBeTruthy();
  });

  it("renders compact cheaper-operation proof row without breaking section layout", () => {
    const { container } = render(<SocialProof />);

    expect(
      screen.getByText("Agent-grade repo automation. Clearer review. Lower token waste."),
    ).toBeInTheDocument();
    expect(screen.getByText("Code Graph RAG")).toBeInTheDocument();
    expect(screen.getByText("Layman compression")).toBeInTheDocument();
    expect(screen.getByText("Review-gated Agent Ops")).toBeInTheDocument();

    // Keep existing proof cards present.
    expect(screen.getByText("Scene-backed walkthroughs")).toBeInTheDocument();
    expect(screen.getByText("Structural visibility")).toBeInTheDocument();
    expect(screen.getByText("File-backed answers")).toBeInTheDocument();
    expect(screen.getByText("Issue-bound agent runs")).toBeInTheDocument();

    // Responsive hooks remain in classnames.
    expect(container.querySelector(".lg\\:grid-cols-4")).toBeTruthy();
    expect(container.querySelector(".md\\:grid-cols-3")).toBeTruthy();
  });
});

