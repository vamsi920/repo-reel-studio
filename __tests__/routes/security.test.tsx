import { renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { renderWithProviders } from "test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SecurityScreen, { useSecurityWorkspaceScope } from "#/routes/security";
import { I18nKey } from "#/i18n/declaration";
import routes from "#/routes";
import { useKnowledgeStore } from "#/stores/knowledge-store";
import type { RepoCandidate } from "#/lib/knowledge/connected-repositories";
import {
  SECURITY_SEVERITIES,
  type SecurityFinding,
  type SecurityScan,
  type SecuritySeverity,
  type SecuritySummary,
} from "#/lib/security/security-types";
import {
  SECURITY_MILESTONE_COPY,
  buildSecurityActivityEvent,
  type SecurityMilestoneKind,
} from "#/lib/security/security-activity";

const connected: RepoCandidate[] = [];
let connectedIsLoading = false;
let connectedIsError = false;

vi.mock("#/lib/knowledge/connected-repositories", () => ({
  useConnectedRepositories: () => ({
    repositories: connected,
    isLoading: connectedIsLoading,
    isError: connectedIsError,
  }),
}));

function setConnected(...candidates: RepoCandidate[]) {
  connected.splice(0, connected.length, ...candidates);
}

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
    branch: string;
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
          branch: overrides.branch ?? "main",
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
    setConnected();
    connectedIsLoading = false;
    connectedIsError = false;
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

  it("lists every severity in the legend, worst-first, with its own label", () => {
    // Regression: `SEVERITY_KEY` maps each `SecuritySeverity` to an `I18nKey`
    // by hand; a copy/paste mistake there (e.g. swapping HIGH and MEDIUM)
    // would previously slip past every test, since nothing asserted the
    // legend's actual item order or content beyond its accessible name.
    renderSecurity();

    const items = screen
      .getByTestId("security-severity-legend")
      .querySelectorAll("li");
    expect(Array.from(items).map((item) => item.textContent)).toEqual([
      I18nKey.SECURITY$SEVERITY_CRITICAL,
      I18nKey.SECURITY$SEVERITY_HIGH,
      I18nKey.SECURITY$SEVERITY_MEDIUM,
      I18nKey.SECURITY$SEVERITY_LOW,
      I18nKey.SECURITY$SEVERITY_INFO,
    ]);
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

  it("gives each future area its own level-3 heading, so a screen reader can jump straight to it", () => {
    // Regression: area titles used to be a plain `<span>`, invisible to
    // heading-based screen reader navigation despite the page already
    // threading heading ids (`FUTURE_AREAS_HEADING_ID`, etc.) carefully
    // everywhere else -- a user could not jump directly to e.g. "Secrets"
    // the way they can to any other named section of this page.
    renderSecurity();

    [
      { category: "repository", titleKey: I18nKey.SECURITY$AREA_REPOSITORY },
      {
        category: "dependencies",
        titleKey: I18nKey.SECURITY$AREA_DEPENDENCIES,
      },
      { category: "secrets", titleKey: I18nKey.SECURITY$AREA_SECRETS },
      {
        category: "misconfiguration",
        titleKey: I18nKey.SECURITY$AREA_MISCONFIGURATION,
      },
      { category: "risk", titleKey: I18nKey.SECURITY$AREA_RISK },
      {
        category: "remediation",
        titleKey: I18nKey.SECURITY$AREA_REMEDIATION,
      },
    ].forEach(({ category, titleKey }) => {
      const card = screen.getByTestId(`security-area-${category}`);
      const heading = within(card).getByRole("heading", {
        level: 3,
        name: titleKey,
      });
      expect(heading).toBeInTheDocument();
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

    it("says it is still loading instead of claiming there is no workspace while the open-conversations query hasn't answered yet", () => {
      // Regression: `useConnectedRepositories` starts with an empty
      // `repositories` array on the very first render whether or not a live
      // conversation exists, until its `isLoading` flag clears -- dropping
      // that flag (as this hook used to) reported "no workspace to scope to"
      // for a user with a real repository open, for the length of that
      // query, before flipping to the correct scope once it resolved.
      connectedIsLoading = true;
      renderSecurity();

      expect(
        screen.getByTestId("security-loading-workspace"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-no-workspace"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("security-workspace-scope"),
      ).not.toBeInTheDocument();
    });

    it("prefers a real scope over the loading state once a knowledge-store entry already answers it", () => {
      // A store entry is a real, resolved answer regardless of whether the
      // open-conversations query (a different data source) has finished.
      seedRepository();
      connectedIsLoading = true;
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
      expect(
        screen.queryByTestId("security-loading-workspace"),
      ).not.toBeInTheDocument();
    });

    it("says it couldn't load connected repositories when that query fails, instead of claiming there is no workspace", () => {
      // Regression: `useConnectedRepositories` reports an empty
      // `repositories` array both when there really are none and when the
      // underlying conversation-history fetch itself failed -- dropping its
      // `isError` flag (as this hook used to) reported "no workspace to
      // scope to" for a real fetch failure, the same class of misleading
      // empty-vs-error state already fixed for the loading case above.
      connectedIsError = true;
      renderSecurity();

      expect(
        screen.getByTestId("security-connected-repositories-error"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-no-workspace"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByTestId("security-loading-workspace"),
      ).not.toBeInTheDocument();
    });

    it("prefers a real scope over the error state once a knowledge-store entry already answers it", () => {
      // A store entry is a real, resolved answer regardless of whether the
      // open-conversations query (a different data source) failed.
      seedRepository();
      connectedIsError = true;
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
      expect(
        screen.queryByTestId("security-connected-repositories-error"),
      ).not.toBeInTheDocument();
    });

    it("scopes to the connected repository's workspace", () => {
      seedRepository();
      renderSecurity();

      const scopeText = screen.getByTestId("security-workspace-scope");
      expect(scopeText).toHaveTextContent("acme/api@abcdef1");
      // `role="status"` so a screen reader hears the newly-scoped repository
      // when the picker below changes it, the same way the sibling
      // no-repositories/not-connected states already announce themselves.
      expect(scopeText).toHaveAttribute("role", "status");
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

    it("says it is still loading instead of claiming an unresolved ?repository= is not connected while the open-conversations query hasn't answered yet", () => {
      // Regression: `byId` also folds in `useConnectedRepositories()`
      // candidates (see the hook's doc comment), which starts empty and
      // loading on first render. A `?repository=` naming one of those
      // candidates previously read as "not connected" for the length of
      // that query -- the same cold-start lie already fixed for the
      // no-repositories case above, just missed on this branch.
      seedRepository();
      connectedIsLoading = true;
      renderSecurity("/security?repository=acme%2Fweb%40main");

      expect(
        screen.getByTestId("security-loading-workspace"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-repository-not-connected"),
      ).not.toBeInTheDocument();
    });

    it("says it couldn't load connected repositories instead of claiming an unresolved ?repository= is not connected when that query fails", () => {
      seedRepository();
      connectedIsError = true;
      renderSecurity("/security?repository=acme%2Fweb%40main");

      expect(
        screen.getByTestId("security-connected-repositories-error"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-repository-not-connected"),
      ).not.toBeInTheDocument();
    });

    it("does not describe the picker by the not-connected hint while that explanation isn't actually shown", () => {
      // The hint element only exists once the page has settled on "really
      // not connected" (see the two regressions above) -- describing the
      // picker by an id that isn't on the page would leave assistive tech
      // pointed at nothing.
      seedRepository();
      seedRepository({ repositoryId: "acme/api@develop", branch: "develop" });
      connectedIsLoading = true;
      renderSecurity("/security?repository=acme%2Fweb%40main");

      const select = screen.getByTestId("security-repository-select");
      expect(select).not.toHaveAttribute("aria-invalid");
      expect(select).not.toHaveAttribute("aria-describedby");
    });

    it("picks the same default repository regardless of store key order", () => {
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      seedRepository();
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
    });

    it("merges and sorts repositories from the knowledge store and open conversations together, not just within one source", () => {
      // Regression: every other merge test either seeds both sources for the
      // *same* repository (store-wins precedence) or uses only one source at
      // a time. Neither proves the combined `repositories` list -- built from
      // two different Maps folded together -- stays correctly sorted by
      // `repositoryId` across sources rather than, say, listing every store
      // entry before every connected-only entry regardless of id order.
      seedRepository({ repositoryId: "acme/zzz@main", repo: "zzz" });
      setConnected({
        repositoryId: "acme/api@main",
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "https://example.com/conv-api",
        sessionApiKey: "key",
        workingDir: "/workspace/api",
      });
      renderSecurity();

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["acme/api", "acme/zzz"]);
      // The lexicographically-first repositoryId wins the default scope,
      // regardless of which source it came from.
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api",
      );
    });

    it("says there is no workspace when ?repository= is stale and nothing is connected, rather than claiming it is unconnected", () => {
      // Regression: with zero connected repositories, "no-repositories" must
      // win over "requested-not-connected" — reporting a specific repository
      // as "not connected" implies others are, which would be a lie when the
      // workspace has no repositories at all.
      renderSecurity("/security?repository=acme%2Fghost%40main");

      expect(screen.getByTestId("security-no-workspace")).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-repository-not-connected"),
      ).not.toBeInTheDocument();
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
        { repositoryId: "acme/api@main", label: "acme/api", branch: "main" },
      ]);
    });

    it("scopes to an open conversation's repository even when nothing has ingested it into the knowledge store yet", () => {
      // Regression: the knowledge store only gains an entry once some
      // Knowledge/CodeGraph/KT-video route ingests a repository this
      // session, so a user opening Security straight from the sidebar (its
      // normal entry point) with a repository open right now, but never
      // visited, previously saw "no workspace to scope to" -- reporting a
      // connected repository as absent.
      setConnected({
        repositoryId: "acme/api@main",
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "https://example.com/conv",
        sessionApiKey: "key",
        workingDir: "/workspace/api",
      });
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api",
      );
      // No resolved commit yet -- the scope line must not invent one.
      expect(
        screen.getByTestId("security-workspace-scope"),
      ).not.toHaveTextContent("@");
    });

    it("ignores an open conversation with no working directory yet -- there is no checkout to scope to", () => {
      setConnected({
        repositoryId: "acme/api@main",
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "https://example.com/conv",
        sessionApiKey: "key",
        workingDir: null,
      });
      renderSecurity();

      expect(screen.getByTestId("security-no-workspace")).toBeInTheDocument();
    });

    it("prefers a knowledge-store entry (a real, resolved commit) over a bare open conversation for the same repository", () => {
      seedRepository();
      setConnected({
        repositoryId: "acme/api@main",
        owner: "acme",
        repo: "api",
        branch: "main",
        conversationUrl: "https://example.com/conv",
        sessionApiKey: "key",
        workingDir: "/workspace/api-live",
      });
      renderSecurity();

      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
    });

    it("drops the scope live when the knowledge store is reset out from under it, the same way a real backend/org switch does", async () => {
      // Regression: every other scoping test only ever asserts a single,
      // static render. `useKnowledgeStore`'s own `reset()` doc comment says
      // it is called on every real backend/org switch while any route,
      // including this one, may still be mounted -- a stale memoised scope
      // that didn't react to that change would keep reporting a workspace
      // that no longer has any backing store entry.
      seedRepository();
      renderSecurity();
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );

      useKnowledgeStore.setState({ byRepositoryId: {} });

      expect(
        await screen.findByTestId("security-no-workspace"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("security-workspace-scope"),
      ).not.toBeInTheDocument();
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
      const scopeText = screen.getByTestId("security-workspace-scope");
      expect(scopeText).toHaveTextContent("acme/web@abcdef1");
      // Regression: switching repositories via the picker must still land on
      // the announced (role="status") element, not a re-render that drops it.
      expect(scopeText).toHaveAttribute("role", "status");
      expect(screen.getByRole("status")).toBe(scopeText);
    });

    it("disambiguates two connected branches of the same repository by branch", async () => {
      // Regression: the label used to be plain "owner/repo", so two branches
      // of the same repository rendered as two options with identical text —
      // a user could not tell which one they were picking.
      seedRepository({ branch: "main" });
      seedRepository({ repositoryId: "acme/api@develop", branch: "develop" });
      renderSecurity();

      const select = screen.getByRole("combobox", {
        name: I18nKey.SECURITY$REPOSITORY_SELECT_LABEL,
      });
      const optionText = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(optionText).toEqual(["acme/api (develop)", "acme/api (main)"]);
      expect(new Set(optionText).size).toBe(optionText.length);

      await userEvent.setup().selectOptions(select, "acme/api@develop");
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/api@abcdef1",
      );
    });

    it("does not disambiguate repositories with distinct owner/repo names", () => {
      seedRepository();
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity();

      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["acme/api", "acme/web"]);
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

    it("links the picker to the not-connected explanation for assistive tech, and drops the link once a real choice is made", async () => {
      // Regression: a screen-reader user landing on the select while
      // `?repository=` names an unknown repository heard only "combo box,
      // not selected" -- the explanation already on screen (the status line
      // above) was never associated with the control itself, unlike this
      // file's own `FIX_WITH_AGENT_HINT_ID` pattern for the disabled
      // "Fix with Agent" button. Two repositories are seeded so the picker
      // itself stays mounted (not the one-option-needs-no-picker case) once
      // a real choice is made, so the cleared attributes can be observed on
      // the same element rather than a detached node.
      const user = userEvent.setup();
      seedRepository();
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity("/security?repository=acme%2Fghost%40main");

      const select = screen.getByTestId("security-repository-select");
      const hint = screen.getByTestId("security-repository-not-connected");
      expect(select).toHaveAttribute("aria-invalid", "true");
      expect(select).toHaveAttribute("aria-describedby", hint.id);

      await user.selectOptions(select, "acme/api@main");

      expect(select).not.toHaveAttribute("aria-invalid");
      expect(select).not.toHaveAttribute("aria-describedby");
    });

    it("does not flag the picker as invalid for an ordinary multi-repository choice", () => {
      seedRepository();
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity();

      expect(
        screen.getByTestId("security-repository-select"),
      ).not.toHaveAttribute("aria-invalid");
    });

    it("excludes an open conversation with no working directory from the picker, alongside a real candidate", () => {
      // Regression: "ignores an open conversation with no working directory
      // yet" above only ever seeds a single connected candidate, so it can't
      // tell the difference between "excluded from the merge" and "excluded
      // because it was the only candidate anyway". With a second, valid
      // candidate present, a missing `!candidate.workingDir` guard would
      // surface the workspace-less repository as a real, selectable option.
      setConnected(
        {
          repositoryId: "acme/api@main",
          owner: "acme",
          repo: "api",
          branch: "main",
          conversationUrl: "https://example.com/conv-api",
          sessionApiKey: "key",
          workingDir: null,
        },
        {
          repositoryId: "acme/web@main",
          owner: "acme",
          repo: "web",
          branch: "main",
          conversationUrl: "https://example.com/conv-web",
          sessionApiKey: "key",
          workingDir: "/workspace/web",
        },
      );
      renderSecurity();

      // Only the candidate with a real checkout is a choice -- one option
      // means no picker, and the page scopes straight to it.
      expect(
        screen.queryByTestId("security-repository-select"),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId("security-workspace-scope")).toHaveTextContent(
        "acme/web",
      );
    });

    it("disambiguates by branch only the repositories that actually collide, leaving a uniquely-named one plain", () => {
      // Regression: every existing disambiguation test seeds either two
      // colliding repositories or two non-colliding ones -- never a mix. The
      // per-label counting in `RepositorySelect` could plausibly disambiguate
      // (or fail to) uniformly across every option instead of per label.
      seedRepository({ branch: "main" });
      seedRepository({ repositoryId: "acme/api@develop", branch: "develop" });
      seedRepository({ repositoryId: "acme/web@main", repo: "web" });
      renderSecurity();

      const optionText = screen
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(optionText).toEqual([
        "acme/api (develop)",
        "acme/api (main)",
        "acme/web",
      ]);
    });

    it("offers and honours the picker for repositories known only from open conversations, not just the knowledge store", async () => {
      // Regression: every other picker test seeds the knowledge store
      // (`seedRepository`); the merge logic that also folds in
      // `useConnectedRepositories()` candidates (see the hook's own doc
      // comment) had no picker-level coverage of its own -- a bug specific to
      // that branch (e.g. a missing `workingDir` key) could slip past every
      // other test in this file.
      const user = userEvent.setup();
      setConnected(
        {
          repositoryId: "acme/api@main",
          owner: "acme",
          repo: "api",
          branch: "main",
          conversationUrl: "https://example.com/conv-api",
          sessionApiKey: "key",
          workingDir: "/workspace/api",
        },
        {
          repositoryId: "acme/web@main",
          owner: "acme",
          repo: "web",
          branch: "main",
          conversationUrl: "https://example.com/conv-web",
          sessionApiKey: "key",
          workingDir: "/workspace/web",
        },
      );
      renderSecurity();

      const select = screen.getByRole("combobox", {
        name: I18nKey.SECURITY$REPOSITORY_SELECT_LABEL,
      });
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["acme/api", "acme/web"]);

      await user.selectOptions(select, "acme/web@main");

      const scopeText = screen.getByTestId("security-workspace-scope");
      // Neither candidate has a resolved commit -- the scope line must show
      // the plain label, not invent a sha for either one.
      expect(scopeText).toHaveTextContent("acme/web");
      expect(scopeText).not.toHaveTextContent("@abcdef1");
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

  it("carries no counts for a summary that has never been scanned, rather than a fabricated all-zero breakdown", () => {
    // Mirrors the `SecurityScan` case above for `SecuritySummary`: the type's
    // own doc comment says `counts` is "Absent (not zeroed) when no scan has
    // ever run" -- an all-zero `SecuritySeverityCounts` would misreport a
    // never-scanned workspace as a scanned-and-clean one. Nothing exercised
    // that contract before this test.
    const summary: SecuritySummary = {
      workspaceId: "/workspace/api",
      status: "not_configured",
    };

    expect(summary.counts).toBeUndefined();
    expect(summary.overallRiskScore).toBeUndefined();
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

  it.each([
    ["scan.started", "running", "Security: scan started"],
    [
      "dependencies.analyzed",
      "running",
      "Security: dependency analysis complete",
    ],
    ["findings.ready", "completed", "Security: findings ready"],
    ["remediation.verified", "completed", "Security: remediation verified"],
    ["scan.failed", "failed", "Security: scan failed"],
  ] as [SecurityMilestoneKind, string, string][])(
    "builds %s with its documented status and title",
    (kind, status, title) => {
      // Regression: this used to read its "expected" status/title back out of
      // `SECURITY_MILESTONE_COPY[kind]` -- the same object the function under
      // test also reads from -- so any two entries' copy could be swapped, or
      // either string could be typo'd, and the assertion would still pass
      // trivially. The expectations here are independent literals so a real
      // copy regression actually fails the test.
      const event = buildSecurityActivityEvent(
        {
          workspaceId: "/workspace/api",
          repositoryId: "acme/api@main",
          commitSha: "abcdef1234567890",
        },
        kind,
        "2026-08-19T00:00:00.000Z",
      );

      expect(event).toMatchObject({ kind, status, title });
    },
  );

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

  it("builds the same id for the same inputs, twice", () => {
    // The id is deliberately deterministic (repository + kind + timestamp),
    // not a per-call sequence number -- unlike CodeGraph's `nextId()`, so a
    // retried publish of the same milestone is idempotent instead of
    // minting a second row. Nothing else in this file pins that down, so a
    // well-meaning refactor toward a monotonic counter (the sibling
    // module's pattern) could silently drop that guarantee.
    const context = {
      workspaceId: "/workspace/api",
      repositoryId: "acme/api@main",
      commitSha: "abcdef1234567890",
    };

    const first = buildSecurityActivityEvent(
      context,
      "scan.started",
      "2026-08-19T00:00:00.000Z",
    );
    const second = buildSecurityActivityEvent(
      context,
      "scan.started",
      "2026-08-19T00:00:00.000Z",
    );

    expect(second.id).toBe(first.id);
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
