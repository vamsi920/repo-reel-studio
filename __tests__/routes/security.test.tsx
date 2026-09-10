import { renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import SecurityScreen, { useSecurityWorkspaceScope } from "#/routes/security";
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
        lastNonTerminalStatus: null,
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

  it("keeps Fix with Agent visible, inert and focusable, and says why", () => {
    renderSecurity();

    const button = screen.getByTestId("security-fix-with-agent");
    // `aria-disabled` rather than `disabled`: a disabled button is removed from
    // the tab order, which also takes its explanation out of reach.
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();

    const hint = screen.getByTestId("security-fix-with-agent-hint");
    expect(hint).toHaveTextContent(I18nKey.SECURITY$FIX_WITH_AGENT_DISABLED);
    expect(button).toHaveAttribute("aria-describedby", hint.id);
  });

  it("names the severity legend, the empty state and the future-areas list", () => {
    renderSecurity();

    expect(
      screen.getByRole("list", {
        name: I18nKey.SECURITY$SEVERITY_LEGEND_LABEL,
      }),
    ).toBe(screen.getByTestId("security-severity-legend"));
    expect(
      screen.getByRole("region", { name: I18nKey.SECURITY$NOT_CONFIGURED }),
    ).toBe(screen.getByTestId("security-empty-state"));
    expect(
      screen.getByRole("list", { name: I18nKey.SECURITY$FUTURE_AREAS }),
    ).toBe(screen.getByTestId("security-future-areas"));
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

    it("refuses to fall back to another repository when ?repository= is unknown", () => {
      seedRepository();
      renderSecurity("/security?repository=acme%2Fghost%40main");

      // Reporting acme/api's posture under a request for acme/ghost would be a
      // lie, so the page says the repository is not connected instead.
      expect(
        screen.queryByTestId("security-workspace-scope"),
      ).not.toBeInTheDocument();
      expect(
        screen.getByTestId("security-repository-not-connected"),
      ).toBeInTheDocument();
    });

    it("picks the same default repository regardless of store key order", () => {
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      seedRepository();
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
    });

    it("identifies the workspace by the snapshot's checkout path", () => {
      seedRepository();

      const { result } = renderHook(() => useSecurityWorkspaceScope(null));

      // Same identity every other workspace-scoped feature uses; a parallel
      // id here would never line up with their data.
      expect(result.current.scope).toMatchObject({
        state: "scoped",
        scope: { workspaceId: "/workspace/api", repositoryId: "acme/api@main" },
      });
      expect(result.current.repositories).toEqual([
        { repositoryId: "acme/api@main", label: "acme/api" },
      ]);
    });
  });

  describe("repository picker", () => {
    it("is absent while the one connected repository is the one shown", () => {
      seedRepository();
      renderSecurity();

      expect(
        screen.queryByTestId("security-repository-select"),
      ).not.toBeInTheDocument();
    });

    it("re-scopes the page to the chosen repository", async () => {
      const user = userEvent.setup();
      seedRepository();
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity();

      const select = screen.getByRole("combobox", {
        name: I18nKey.SECURITY$REPOSITORY_SELECT_LABEL,
      });
      expect(select).toHaveValue("acme/api@main");
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["acme/api", "acme/web"]);

      await user.selectOptions(select, "acme/web@main");

      expect(select).toHaveValue("acme/web@main");
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/web@abcdef1",
      );
    });

    it("offers a way out of an unknown ?repository=", async () => {
      const user = userEvent.setup();
      seedRepository();
      renderSecurity("/security?repository=acme%2Fghost%40main");

      // Nothing is selected: the unknown id must not masquerade as a choice.
      const select = screen.getByTestId("security-repository-select");
      expect(select).toHaveValue("");
      expect(
        screen.getByRole("option", {
          name: I18nKey.SECURITY$REPOSITORY_SELECT_PICK,
        }),
      ).toBeDisabled();

      await user.selectOptions(select, "acme/api@main");

      expect(
        screen.queryByTestId("security-repository-not-connected"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
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

  it("scopes the event to the repository and commit it describes", () => {
    const event = buildSecurityActivityEvent(
      {
        workspaceId: "/workspace/api",
        repositoryId: "acme/api@main",
        commitSha: "abcdef1234567890",
      },
      "scan.failed",
      "2026-08-19T00:00:00.000Z",
      "scanner exited with code 2",
    );

    expect(event).toMatchObject({
      id: "security-acme/api@main-scan.failed-2026-08-19T00:00:00.000Z",
      status: "failed",
      kind: "scan.failed",
      entityType: "repository",
      entityId: "acme/api@main",
      metadata: { commitSha: "abcdef1234567890" },
      message: "scanner exited with code 2",
    });
  });

  it("omits the message field entirely when there is none", () => {
    const event = buildSecurityActivityEvent(
      {
        workspaceId: "/workspace/api",
        repositoryId: "acme/api@main",
        commitSha: "abcdef1234567890",
      },
      "findings.ready",
      "2026-08-19T00:00:00.000Z",
    );

    // `message: undefined` would still serialise as a key; consumers that
    // spread the event into a store row must not pick up a phantom column.
    expect("message" in event).toBe(false);
    expect(event.status).toBe("completed");
  });
});
