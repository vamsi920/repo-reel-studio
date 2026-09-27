import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProbeResultPanel } from "#/components/features/environment/shared/probe-result-panel";
import { MAX_TOLERABLE_CLOCK_SKEW_MS } from "#/lib/environment/types/probe";
import type { ProbeResult } from "#/lib/environment/types/probe";

function buildResult(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    ok: true,
    vantage: "edge",
    latencyMs: 42,
    checks: [],
    probedAt: "2026-09-27T00:00:00.000Z",
    ...overrides,
  };
}

describe("ProbeResultPanel", () => {
  it("shows a success badge and no clock-skew warning for a clean result", () => {
    render(<ProbeResultPanel result={buildResult()} />);
    expect(screen.getByTestId("probe-result")).toHaveAttribute(
      "data-ok",
      "true",
    );
    expect(
      screen.queryByText(/ENVIRONMENT\$CLOCK_SKEW_WARNING/),
    ).not.toBeInTheDocument();
  });

  it("does not warn about clock skew within tolerance", () => {
    render(
      <ProbeResultPanel
        result={buildResult({ clockSkewMs: MAX_TOLERABLE_CLOCK_SKEW_MS - 1 })}
      />,
    );
    expect(
      screen.queryByText(/ENVIRONMENT\$CLOCK_SKEW_WARNING/),
    ).not.toBeInTheDocument();
  });

  // A clock-skew warning used to be rendered with `ENVIRONMENT$STATUS_ERROR`
  // ("Failing") followed by a bare number of seconds -- text that contradicts
  // an "ok" badge above it and never says what is actually wrong. It has its
  // own key now, and this asserts that key -- not the reused status one --
  // is what actually renders.
  it("warns with a dedicated clock-skew message once skew exceeds tolerance", () => {
    render(
      <ProbeResultPanel
        result={buildResult({ clockSkewMs: MAX_TOLERABLE_CLOCK_SKEW_MS + 5000 })}
      />,
    );
    expect(
      screen.getByText("ENVIRONMENT$CLOCK_SKEW_WARNING"),
    ).toBeInTheDocument();
  });

  it("warns on a negative (behind, not ahead) skew past tolerance too", () => {
    render(
      <ProbeResultPanel
        result={buildResult({
          clockSkewMs: -(MAX_TOLERABLE_CLOCK_SKEW_MS + 5000),
        })}
      />,
    );
    expect(
      screen.getByText("ENVIRONMENT$CLOCK_SKEW_WARNING"),
    ).toBeInTheDocument();
  });

  it("renders remediation steps when the probe failed", () => {
    render(
      <ProbeResultPanel
        result={buildResult({
          ok: false,
          remediation: {
            codeKey: "SOME_REMEDIATION_CODE",
            agentActionable: false,
            steps: [
              { kind: "env", targetKey: "FIX_STEP_ONE" },
              { kind: "network", targetKey: "FIX_STEP_TWO", value: "1.2.3.4" },
            ],
          },
        })}
      />,
    );
    expect(screen.getByText("SOME_REMEDIATION_CODE")).toBeInTheDocument();
    expect(screen.getByText("FIX_STEP_ONE")).toBeInTheDocument();
    expect(screen.getByText("1.2.3.4")).toBeInTheDocument();
  });
});
