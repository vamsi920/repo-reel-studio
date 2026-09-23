import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EnvironmentNetworkScreen, {
  buildEgressAllowlistCsv,
} from "#/routes/environment-network";
import { I18nKey } from "#/i18n/declaration";
import type { EgressHost } from "#/lib/environment/types/capability";

const state = vi.hoisted(() => ({
  checks: [] as Array<{
    kind: string;
    target: string;
    vantage: string;
    ok: boolean;
  }>,
}));

vi.mock("#/hooks/query/use-environment-profile", () => ({
  useEnvironmentProfile: () => ({ data: null }),
}));

vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));

vi.mock("#/hooks/query/use-environment-checks", () => ({
  useEnvironmentChecks: () => ({ data: state.checks }),
}));

const GITHUB_API_ROW = "egress-row-api.github.com";

describe("Environment network egress matrix", () => {
  it("gives every status dot a real accessible name and a legend explaining the colors", () => {
    // Regression: every cell rendered aria-hidden with no text alternative
    // anywhere on the page, so a screen-reader user (and a sighted user, for
    // the untested-vs-reachable distinction) had no way to tell "never
    // probed" apart from a confirmed status.
    state.checks = [];
    render(<EnvironmentNetworkScreen />);

    const row = screen.getByTestId(GITHUB_API_ROW);
    const dots = row.querySelectorAll('[role="img"]');
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      expect(dot).not.toHaveAttribute("aria-hidden");
      const label = dot.getAttribute("aria-label") ?? "";
      expect(label).toContain("api.github.com");
      expect(label).toContain(I18nKey.ENVIRONMENT$CELL_STATE_UNTESTED);
    });

    // A legend distinguishing all three states is rendered on the page.
    expect(
      screen.getByText(I18nKey.ENVIRONMENT$CELL_STATE_REACHABLE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.ENVIRONMENT$CELL_STATE_UNREACHABLE),
    ).toBeInTheDocument();
    expect(
      screen.getByText(I18nKey.ENVIRONMENT$CELL_STATE_UNTESTED),
    ).toBeInTheDocument();
  });

  it("labels a confirmed-reachable host as reachable, not just green", () => {
    state.checks = [
      {
        kind: "egress",
        target: "api.github.com",
        vantage: "browser",
        ok: true,
      },
    ];
    render(<EnvironmentNetworkScreen />);

    const row = screen.getByTestId(GITHUB_API_ROW);
    const dots = row.querySelectorAll('[role="img"]');
    const labels = Array.from(dots).map((dot) =>
      dot.getAttribute("aria-label"),
    );
    expect(
      labels.some((label) =>
        label?.endsWith(`: ${I18nKey.ENVIRONMENT$CELL_STATE_REACHABLE}`),
      ),
    ).toBe(true);
  });

  it("labels a confirmed-failing host as not reachable, distinct from untested", () => {
    state.checks = [
      {
        kind: "egress",
        target: "api.github.com",
        vantage: "browser",
        ok: false,
      },
    ];
    render(<EnvironmentNetworkScreen />);

    const row = screen.getByTestId(GITHUB_API_ROW);
    const dots = row.querySelectorAll('[role="img"]');
    const labels = Array.from(dots).map((dot) =>
      dot.getAttribute("aria-label"),
    );
    // The failing vantage is distinct from the other two, still-untested vantages.
    expect(
      labels.some((label) =>
        label?.endsWith(`: ${I18nKey.ENVIRONMENT$CELL_STATE_UNREACHABLE}`),
      ),
    ).toBe(true);
    expect(
      labels.some((label) =>
        label?.endsWith(`: ${I18nKey.ENVIRONMENT$CELL_STATE_UNTESTED}`),
      ),
    ).toBe(true);
  });
});

describe("buildEgressAllowlistCsv", () => {
  const host: EgressHost = {
    host: "api.github.com",
    port: 443,
    purposeKey: I18nKey.ENVIRONMENT$EGRESS_TITLE,
    mirrorable: true,
  };
  const translate = (key: string) => key;

  it("neutralizes a mirror value that starts with a formula-trigger character", () => {
    // Arrange: `mirrors` is populated from an agent-proposed profile patch a
    // human approved (see `ProposalCard`) -- it is not developer-controlled
    // text and must be treated as untrusted export input.
    const mirrors = { "api.github.com": '=HYPERLINK("http://evil.example")' };

    // Act
    const csv = buildEgressAllowlistCsv([host], mirrors, translate);
    const dataLine = csv.split("\n")[1];

    // Assert
    expect(dataLine).not.toMatch(/,=/);
    expect(dataLine).toContain("'=HYPERLINK");
  });

  it("quotes a mirror value containing a comma instead of corrupting the row", () => {
    // Arrange
    const mirrors = { "api.github.com": "mirror.internal, backup" };

    // Act
    const csv = buildEgressAllowlistCsv([host], mirrors, translate);
    const dataLine = csv.split("\n")[1];

    // Assert: the mirror column stays one quoted field, not two bare ones.
    expect(dataLine).toBe(
      `api.github.com,443,${I18nKey.ENVIRONMENT$EGRESS_TITLE},yes,"mirror.internal, backup"`,
    );
  });

  it("renders a plain row unescaped when nothing is unusual", () => {
    // Arrange
    const mirrors = {};

    // Act
    const csv = buildEgressAllowlistCsv([host], mirrors, translate);

    // Assert
    expect(csv).toBe(
      `host,port,purpose,mirrorable,mirror\napi.github.com,443,${I18nKey.ENVIRONMENT$EGRESS_TITLE},yes,`,
    );
  });
});
