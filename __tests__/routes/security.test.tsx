import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import SecurityScreen from "#/routes/security";
import { I18nKey } from "#/i18n/declaration";
import routes from "#/routes";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import {
  SECURITY_SEVERITIES,
  type SecurityFinding,
  type SecurityScan,
  type SecuritySeverity,
} from "#/lib/security/security-types";
import {
  SECURITY_MILESTONE_COPY,
  buildSecurityActivityEvent,
} from "#/lib/security/security-activity";

function renderSecurity(initialPath = "/security") {
  return renderWithProviders(
    <MemoryRouter initialEntries={[initialPath]}>
      <SecurityScreen />
    </MemoryRouter>,
  );
}

function seedRepository(
  overrides: Partial<{
    repositoryId: string;
    owner: string;
    repo: string;
  }> = {},
) {
  const repositoryId = overrides.repositoryId ?? "acme/api@main";
  useKnowledgeStore.setState((state) => ({
    byRepositoryId: {
      ...state.byRepositoryId,
      [repositoryId]: {
        snapshot: {
          repositoryId,
          owner: overrides.owner ?? "acme",
          repo: overrides.repo ?? "api",
          branch: "main",
          commitSha: "abcdef1234567890",
          localPath: `/workspace/${overrides.repo ?? "api"}`,
        },
        conversationUrl: null,
        sessionApiKey: null,
        status: "ready",
        progress: null,
        knowledge: null,
        error: null,
        refreshCadence: "manual",
        qualityFlags: [],
      },
    },
  }));
}

describe("Security route", () => {
  beforeEach(() => {
    useKnowledgeStore.setState({ byRepositoryId: {} });
  });

  it("is registered at /security", () => {
    const paths = JSON.stringify(routes);
    expect(paths).toContain("routes/security.tsx");
    expect(paths).toContain("security");
  });

  it("renders the header and Beta label", () => {
    renderSecurity();

    expect(screen.getByTestId("security-page")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: I18nKey.SECURITY$TITLE,
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(I18nKey.SECURITY$SUBTITLE)).toBeInTheDocument();
    expect(screen.getByTestId("security-beta-badge")).toHaveTextContent(
      I18nKey.SECURITY$BETA,
    );
  });

  it("shows the not-configured empty state with no findings or numbers", () => {
    seedRepository();
    renderSecurity();

    expect(
      screen.getByText(I18nKey.SECURITY$NOT_CONFIGURED),
    ).toBeInTheDocument();
    // No fabricated risk score or finding counts anywhere on the page.
    expect(screen.queryByText(/\b\d+ findings?\b/)).not.toBeInTheDocument();
    expect(screen.queryByText(/risk score:/i)).not.toBeInTheDocument();
  });

  it("keeps Fix with Agent visible but disabled", () => {
    renderSecurity();

    expect(screen.getByTestId("security-fix-with-agent")).toBeDisabled();
  });

  it("lists every future area", () => {
    renderSecurity();

    [
      "repository",
      "dependencies",
      "secrets",
      "misconfiguration",
      "risk",
      "remediation",
    ].forEach((category) => {
      expect(
        screen.getByTestId(`security-area-${category}`),
      ).toBeInTheDocument();
    });
  });

  describe("workspace scoping", () => {
    it("says so when there is no workspace to scope to", () => {
      renderSecurity();

      expect(screen.getByTestId("security-no-workspace")).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-workspace-scope"),
      ).not.toBeInTheDocument();
    });

    it("scopes to the connected repository's workspace", () => {
      seedRepository();
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
    });

    it("honours the ?repository= selection", () => {
      seedRepository();
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity("/security?repository=acme%2Fweb%40main");

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/web@abcdef1",
      );
    });
  });
});

describe("Security types", () => {
  it("orders severities worst-first", () => {
    expect(SECURITY_SEVERITIES).toEqual([
      "critical",
      "high",
      "medium",
      "low",
      "info",
    ]);
  });

  it("types a finding with the full workspace-scoped shape", () => {
    const severity: SecuritySeverity = "high";
    const finding: SecurityFinding = {
      id: "f1",
      workspaceId: "/workspace/api",
      repositoryId: "acme/api@main",
      commitSha: "abcdef1234567890",
      scanner: "example",
      category: "dependencies",
      severity,
      title: "Example",
      description: "Example",
      filePath: "package.json",
      lineRange: { start: 3, end: 4 },
      evidence: [{ kind: "dependency", summary: "Example" }],
      riskScore: 70,
      status: "open",
      remediation: { kind: "upgrade", summary: "Upgrade" },
      verificationStatus: "unverified",
      createdAt: "2026-08-19T00:00:00.000Z",
    };

    expect(finding.workspaceId).toBe("/workspace/api");
    expect(finding.verificationStatus).toBe("unverified");
  });

  it("treats an unscanned workspace as not-configured, not clean", () => {
    const scan: SecurityScan = {
      id: "s1",
      workspaceId: "/workspace/api",
      repositoryId: "acme/api@main",
      commitSha: "abcdef1234567890",
      status: "not_configured",
      scanners: [],
    };

    expect(scan.findingIds).toBeUndefined();
  });
});

describe("Security activity contract", () => {
  it("covers the four product milestones plus failure", () => {
    expect(Object.keys(SECURITY_MILESTONE_COPY).sort()).toEqual(
      [
        "dependencies.analyzed",
        "findings.ready",
        "remediation.verified",
        "scan.failed",
        "scan.started",
      ].sort(),
    );
  });

  it("builds a workspace-scoped event without publishing it", () => {
    const event = buildSecurityActivityEvent(
      {
        workspaceId: "/workspace/api",
        repositoryId: "acme/api@main",
        commitSha: "abcdef1234567890",
      },
      "scan.started",
      "2026-08-19T00:00:00.000Z",
    );

    expect(event.source).toBe("security");
    expect(event.workspaceId).toBe("/workspace/api");
    expect(event.title).toBe("Security: scan started");
  });
});
