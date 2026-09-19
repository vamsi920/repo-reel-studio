import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CollectorUnavailable } from "#/components/features/agentops/collector-unavailable";
import {
  AgentOpsRequestError,
  AgentOpsUnavailableError,
} from "#/api/agentops-service/agentops-service.api";

describe("CollectorUnavailable", () => {
  it("shows the collector's own parsed error message", () => {
    const error = new AgentOpsRequestError(
      "/runs/123/cancel",
      409,
      JSON.stringify({ error: "This run is already paused." }),
    );
    render(<CollectorUnavailable error={error} />);

    expect(
      screen.getByText("This run is already paused."),
    ).toBeInTheDocument();
  });

  it("shows the crafted message for a network-level failure", () => {
    const error = new AgentOpsUnavailableError(
      "The AgentOps collector is not reachable (Failed to fetch).",
    );
    render(<CollectorUnavailable error={error} />);

    expect(
      screen.getByText(
        "The AgentOps collector is not reachable (Failed to fetch).",
      ),
    ).toBeInTheDocument();
  });

  it("never renders the raw request path or an unparsed response body", () => {
    // No parseable `{ error }` JSON body — e.g. an ingress 502 HTML page —
    // falls back to AgentOpsRequestError's internal message, which embeds
    // the request path and status. That must never reach the operator.
    const error = new AgentOpsRequestError(
      "/summary",
      502,
      "<html><body>Bad Gateway</body></html>",
    );
    render(<CollectorUnavailable error={error} />);

    expect(screen.queryByText(/\/summary/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bad Gateway/)).not.toBeInTheDocument();
    expect(screen.queryByText(/502/)).not.toBeInTheDocument();
  });

  it("renders no detail line for a plain Error", () => {
    render(<CollectorUnavailable error={new Error("boom")} />);

    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });
});
