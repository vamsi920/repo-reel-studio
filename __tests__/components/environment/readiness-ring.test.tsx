import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReadinessRing } from "#/components/features/environment/overview/readiness-ring";

const reducedMotion = vi.hoisted(() => ({ value: false }));

vi.mock("framer-motion", async () => {
  const actual =
    await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => reducedMotion.value };
});

describe("ReadinessRing", () => {
  it("shows the score as a number, not only as an arc", () => {
    render(<ReadinessRing score={72} blockingCount={0} />);
    expect(screen.getByTestId("readiness-ring")).toHaveAttribute(
      "data-score",
      "72",
    );
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("clamps a nonsensical score rather than drawing outside the ring", () => {
    render(<ReadinessRing score={140} blockingCount={0} />);
    expect(screen.getByTestId("readiness-ring")).toHaveAttribute(
      "data-score",
      "100",
    );
  });

  it("reads 'not ready' whenever anything is blocking, however high the score", () => {
    // A 95% score with one blocking item is not "nearly ready" -- the product
    // does not start. The headline has to follow the blocker, not the number.
    render(<ReadinessRing score={95} blockingCount={1} />);
    expect(
      screen.getByText("ENVIRONMENT$READINESS_BLOCKED"),
    ).toBeInTheDocument();
  });

  it("keeps an accessible label so the arc is not the only signal", () => {
    render(<ReadinessRing score={40} blockingCount={2} />);
    expect(screen.getByRole("img", { name: "40%" })).toBeInTheDocument();
  });

  it("renders without animating when reduced motion is requested", () => {
    reducedMotion.value = true;
    render(<ReadinessRing score={60} blockingCount={0} />);
    expect(screen.getByTestId("readiness-ring")).toBeInTheDocument();
    expect(screen.getByText("60")).toBeInTheDocument();
    reducedMotion.value = false;
  });
});
