import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DetailHeader } from "#/components/features/automations/detail/detail-header";
import type { Automation } from "#/types/automation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("#/hooks/use-has-permission", () => ({
  useHasPermission: () => true,
}));

const baseAutomation: Automation = {
  id: "auto-1",
  name: "GitHub Bug Fixer",
  prompt: null,
  enabled: true,
  trigger: { type: "event", source: "github" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("DetailHeader", () => {
  it("shows the unsupported-trigger badge next to the active status for a github event automation", () => {
    render(
      <DetailHeader
        automation={baseAutomation}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDownloadTarball={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("unsupported-trigger-badge"),
    ).toBeInTheDocument();
  });

  it("does not show the unsupported-trigger badge for a schedule automation", () => {
    render(
      <DetailHeader
        automation={{ ...baseAutomation, trigger: { type: "cron" } }}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onExport={vi.fn()}
        onDownloadTarball={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("unsupported-trigger-badge"),
    ).not.toBeInTheDocument();
  });
});
