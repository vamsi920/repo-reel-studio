import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunStatusBadge } from "#/components/features/agentops/run-status-badge";
import {
  RUN_STATUS_COLORS,
  RUN_STATUS_LABEL_KEYS,
} from "#/components/features/agentops/agentops-formatting";
import type { AgentOpsRunStatus } from "#/api/agentops-service/agentops-service.types";

const ALL_STATUSES = Object.keys(RUN_STATUS_LABEL_KEYS) as AgentOpsRunStatus[];

describe("RunStatusBadge", () => {
  it.each(ALL_STATUSES)(
    "renders the translated label and tone colour for %s",
    (status) => {
      render(<RunStatusBadge status={status} />);
      const badge = screen.getByTestId(`run-status-${status}`);
      // `useTranslation` is mocked (see vitest.setup.ts) to return the key
      // itself, so this also confirms the badge goes through `t()` for a
      // known status rather than falling back to the raw status string.
      expect(badge).toHaveTextContent(RUN_STATUS_LABEL_KEYS[status]);
      expect(badge).toHaveStyle({ color: RUN_STATUS_COLORS[status] });
    },
  );

  it("falls back to the raw status text for a value the label map does not cover", () => {
    // AgentOpsRunStatus is a compile-time contract; the collector is a
    // separate process and nothing stops it from reporting a status this
    // frontend build does not yet know about. The badge must still render
    // something useful instead of crashing on a missing translation key.
    const unknownStatus = "queued" as AgentOpsRunStatus;
    render(<RunStatusBadge status={unknownStatus} />);
    const badge = screen.getByTestId("run-status-queued");
    expect(badge).toHaveTextContent("queued");
    expect(badge).toHaveStyle({ color: "var(--text-tertiary)" });
  });
});
