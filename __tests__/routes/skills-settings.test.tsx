import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  screen,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SkillsSettingsScreen from "#/routes/skills-settings";
import SettingsService from "#/api/settings-service/settings-service.api";
import SkillsService from "#/api/skills-service";
import {
  ADD_SKILL_DOCS_URL,
  ADD_SKILL_EXAMPLE_COMMAND,
} from "#/constants/skills-docs";
import { MOCK_DEFAULT_USER_SETTINGS } from "#/mocks/handlers";
import { Settings, SkillInfo } from "#/types/settings";
import { ActiveBackendProvider } from "#/contexts/active-backend-context";
import * as ToastHandlers from "#/utils/custom-toast-handlers";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";

const navigateMock = vi.fn();

vi.mock("#/context/navigation-context", () => ({
  useNavigation: () => ({
    navigate: navigateMock,
    currentPath: "/skills",
    conversationId: null,
    isNavigating: false,
  }),
  NavigationProvider: ({ children }: { children: React.ReactNode }) => children,
}));

function buildSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...MOCK_DEFAULT_USER_SETTINGS,
    ...overrides,
    agent_settings: {
      ...MOCK_DEFAULT_USER_SETTINGS.agent_settings,
      ...overrides.agent_settings,
    },
  };
}

function buildSkill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    name: "deno",
    type: "knowledge",
    source:
      "/Users/test/.openhands/cache/skills/public-skills/skills/deno/SKILL.md",
    description:
      "If the project uses deno, use this skill to initialize Deno projects.",
    triggers: ["deno", "deno.json", "deno.lock"],
    version: "1.0.0",
    license: "Apache-2.0",
    compatibility: "Requires Deno 1.40+",
    metadata: null,
    allowed_tools: ["bash"],
    is_agentskills_format: true,
    disable_model_invocation: false,
    ...overrides,
  };
}

function renderSkillsSettingsScreen(initialEntry = "/skills") {
  const router = createMemoryRouter(
    [
      {
        path: "/skills",
        Component: () => (
          <ActiveBackendProvider>
            <SkillsSettingsScreen />
          </ActiveBackendProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );

  render(<RouterProvider router={router} />, {
    wrapper: ({ children }) => (
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { queries: { retry: false } },
          })
        }
      >
        {children}
      </QueryClientProvider>
    ),
  });

  return router;
}

describe("SkillsSettingsScreen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigateMock.mockReset();
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(buildSettings());
  });

  it("renders the description text inside the description badge", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();

    const description = await screen.findByTestId(
      "skills-settings-description",
    );
    expect(description).toHaveTextContent("SETTINGS$SKILLS_PAGE_DESCRIPTION");
    expect(screen.getByText("NAV$CUSTOMIZE")).toBeInTheDocument();
    // The rail labels are i18n keys now; the global mock returns keys as-is.
    expect(screen.getByTestId("sidebar-extensions-/skills")).toHaveTextContent(
      "SETTINGS$SKILLS_TITLE",
    );
    expect(screen.getByTestId("sidebar-extensions-/plugins")).toHaveTextContent(
      "SETTINGS$PLUGINS_TITLE",
    );
    expect(screen.getByTestId("sidebar-extensions-/mcp")).toHaveTextContent(
      "NAV$MCP_SERVERS",
    );
  });

  it("shows an error state instead of a misleading empty list when skills fail to load", async () => {
    // Regression: SkillsService.getSkills() used to swallow every failure
    // (a real agent-server 500 included) as "fall back to the public
    // catalog", so a real outage rendered as an ordinary empty state with no
    // indication anything had failed.
    vi.spyOn(SkillsService, "getSkills").mockRejectedValue(
      new Error("agent-server 500"),
    );

    renderSkillsSettingsScreen();

    expect(await screen.findByTestId("skills-error")).toHaveTextContent(
      "SETTINGS$SKILLS_LOAD_ERROR",
    );
    expect(screen.queryByTestId("skills-empty")).not.toBeInTheDocument();
  });

  it("shows card subtitle text from skill content when description is omitted", async () => {
    const skill = buildSkill({
      name: "SSH Microagent",
      description: null,
      content: `---
description: Connect and run commands on remote machines over SSH.
---
# SSH Microagent

Full skill body.`,
      triggers: ["ssh"],
    });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(
      "Connect and run commands on remote machines over SSH.",
    );
  });

  it("surfaces the YAML description under the card title with the source path beneath it", async () => {
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-description-${skill.name}`),
    ).toHaveTextContent(skill.description!);
    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent(skill.source!);
    expect(
      within(card).getByTestId(`skill-icon-${skill.name}`),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("skill-type-badge-knowledge"),
    ).toHaveTextContent("SETTINGS$SKILLS_TYPE_KNOWLEDGE");
  });

  it("copies the source path when the copy button is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(
      within(card).getByTestId(`skill-copy-source-${skill.name}`),
    );

    expect(writeText).toHaveBeenCalledWith(skill.source);
  });

  it("reports a failed clipboard write instead of silently doing nothing", async () => {
    const user = userEvent.setup();
    const skill = buildSkill();
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => "toast-id");
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("clipboard unavailable"),
    );
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    const copyButton = within(card).getByTestId(
      `skill-copy-source-${skill.name}`,
    );

    await user.click(copyButton);

    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    // No "Copied" confirmation for a copy that never happened, and the button
    // stays usable so the user can retry.
    expect(copyButton).toHaveAttribute(
      "aria-label",
      "SETTINGS$SKILLS_COPY_PATH",
    );
    expect(copyButton).not.toBeDisabled();
  });

  it("does not open the detail modal when the card toggle is activated by keyboard", async () => {
    const user = userEvent.setup();
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    const toggle = within(card).getByTestId(`skill-toggle-${skill.name}`);

    toggle.focus();
    await user.keyboard("{Enter}");

    expect(screen.queryByTestId("skill-detail-modal")).not.toBeInTheDocument();
  });

  it("hides the copy button when the source is a scope label instead of a path", async () => {
    const skill = buildSkill({ name: "add_repo_inst", source: "global" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    expect(
      within(card).getByTestId(`skill-source-${skill.name}`),
    ).toHaveTextContent("global");
    expect(
      within(card).queryByTestId(`skill-copy-source-${skill.name}`),
    ).not.toBeInTheDocument();
  });

  it("filters skills by name, description, or trigger via the search input", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", description: "Deno runtime helper" }),
      buildSkill({
        name: "vercel",
        description: "Preview deployment helper",
        triggers: ["vercel", "preview deployment"],
        source: "/skills/vercel/SKILL.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "preview" },
    });

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-vercel")).toBeInTheDocument();
  });

  it("narrows the visible skills when a facet row is selected", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    const router = renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    await user.click(screen.getByTestId("skill-facet-type-repo"));

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
    expect(router.state.location.search).toBe("?type=repo");
  });

  it("seeds the filter state from the URL on load", async () => {
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", category: "environment" }),
      buildSkill({ name: "prd", category: "writing", triggers: [] }),
    ]);

    renderSkillsSettingsScreen("/skills?category=writing");

    await screen.findByTestId("skill-card-prd");
    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
  });

  it("restores the search text when history navigation changes the query", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge", description: "A helper" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        description: "A helper",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    const router = renderSkillsSettingsScreen("/skills?q=helper");
    await screen.findByTestId("skill-card-deno");
    const search = screen.getByTestId("skills-search-input");

    // Push a second entry, then drop the query from it, so going back lands on a URL whose `q` differs from the input.
    await user.click(screen.getByTestId("skill-facet-type-repo"));
    fireEvent.change(search, { target: { value: "" } });
    await waitFor(() =>
      expect(router.state.location.search).toBe("?type=repo"),
    );

    await act(() => router.navigate(-1));

    await waitFor(() => expect(search).toHaveValue("helper"));
    expect(router.state.location.search).toBe("?q=helper");
  });

  it("filters through the mobile filters modal", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({
        name: "global-rules",
        type: "repo",
        triggers: [],
        source: "/skills/global-rules.md",
      }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    await user.click(screen.getByTestId("skills-filters-button"));
    const modal = await screen.findByTestId("skill-filters-modal");
    await user.click(within(modal).getByTestId("skill-facet-type-repo"));

    expect(screen.queryByTestId("skill-card-deno")).not.toBeInTheDocument();
    expect(screen.getByTestId("skill-card-global-rules")).toBeInTheDocument();
  });

  it("keeps the facet rail off screen until xl, where the Filters button takes over", async () => {
    // Two types, so the rail has a facet group to render at all.
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([
      buildSkill({ name: "deno", type: "knowledge" }),
      buildSkill({ name: "global-rules", type: "repo", triggers: [] }),
    ]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skill-card-deno");

    // At md/lg the main sidebar + ExtensionsNavigation + a 240px rail leave
    // the results column ~100px wide (two-letter card names), so the rail is
    // an xl-only column and the toolbar's Filters button covers every width
    // below it — the two breakpoints must stay paired.
    const rail = screen.getByTestId("skill-facet-rail");
    expect(rail).toHaveClass("hidden", "xl:flex");
    expect(rail).not.toHaveClass("md:flex", "lg:flex");
    const filtersButton = screen.getByTestId("skills-filters-button");
    expect(filtersButton).toHaveClass("xl:hidden");
    expect(filtersButton).not.toHaveClass("md:hidden", "lg:hidden");
  });

  it("opens a detail modal with full metadata when a skill card is clicked", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({
      name: "rich",
      license: "MIT",
      compatibility: "Requires Python 3.11+",
      allowed_tools: ["bash", "execute_bash"],
      source: "/skills/rich/SKILL.md",
    });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(modal).toHaveAttribute("data-skill-name", skill.name);
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-license`),
    ).toHaveTextContent("MIT");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-compatibility`),
    ).toHaveTextContent("Requires Python 3.11+");
    expect(
      within(modal).getByTestId(`skill-modal-pill-${skill.name}-tool-bash`),
    ).toHaveTextContent("bash");
    expect(
      within(modal).getByTestId(
        `skill-modal-pill-${skill.name}-tool-execute_bash`,
      ),
    ).toHaveTextContent("execute_bash");
    expect(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    ).toBeInTheDocument();
  });

  it("toggles a skill from the detail modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "toggle-me" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    await user.click(card);

    const modal = await screen.findByTestId("skill-detail-modal");
    expect(
      within(modal).getByText("SETTINGS$SKILLS_ENABLED"),
    ).toBeInTheDocument();

    await user.click(
      within(modal).getByTestId(`skill-modal-toggle-${skill.name}`),
    );

    expect(card).not.toHaveClass("opacity-70");
    expect(
      within(card).getByTestId(`skill-toggle-${skill.name}`),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      within(modal).getByText("SETTINGS$SKILLS_DISABLED"),
    ).toBeInTheDocument();
  });

  it("saves disabled_skills to the server when a skill is toggled off and settings has no prior disabled_skills field", async () => {
    // Reproduces the bug where disabled_skills is absent from settings (undefined),
    // which must still hydrate to an empty local set rather than leaving the
    // toggle unable to save.
    const user = userEvent.setup();
    const skill = buildSkill({ name: "save-me" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: undefined }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);
    const card = screen.getByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ disabled_skills: [skill.name] }),
      ),
    );
  });

  it("does not save settings on initial load, only after an actual toggle", async () => {
    const skill = buildSkill({ name: "untouched" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: ["untouched"] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    // Hydration should have applied the server's disabled state by now.
    expect(
      within(card).getByTestId(`skill-toggle-${skill.name}`),
    ).toHaveAttribute("aria-checked", "false");

    expect(saveSpy).not.toHaveBeenCalled();
  });

  it("saves an updated disabled list when a skill is toggled off and settings already has disabled_skills", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "another-skill" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: [] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);
    const card = screen.getByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    await waitFor(() =>
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ disabled_skills: [skill.name] }),
      ),
    );
  });

  it("snaps the toggle back to the saved state when the settings save fails", async () => {
    // Regression: a failed save left the optimistic flip in place (and the
    // State facet counts with it), so the page drifted from the server until
    // a reload.
    const user = userEvent.setup();
    const skill = buildSkill({ name: "add-javadoc" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: [] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockRejectedValue(new Error("Request failed: Failed to fetch"));
    const toastSpy = vi
      .spyOn(ToastHandlers, "displayErrorToast")
      .mockImplementation(() => {});

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);
    const toggle = within(card).getByTestId(`skill-toggle-${skill.name}`);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    await user.click(toggle);

    await waitFor(() => expect(saveSpy).toHaveBeenCalled());
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        within(card).getByTestId(`skill-toggle-${skill.name}`),
      ).toHaveAttribute("aria-checked", "true"),
    );
    expect(card).not.toHaveClass("opacity-70");
  });

  it("keeps a successful toggle flipped even though another card's save failed earlier", async () => {
    // The revert restores the server's last known state, not a blanket
    // "undo everything": a later save that succeeds must still win.
    const user = userEvent.setup();
    const skill = buildSkill({ name: "flaky-skill" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);
    const getSpy = vi
      .spyOn(SettingsService, "getSettings")
      .mockResolvedValue(buildSettings({ disabled_skills: [] }));
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockRejectedValueOnce(new Error("Request failed: Failed to fetch"))
      .mockImplementation(async () => {
        getSpy.mockResolvedValue(
          buildSettings({ disabled_skills: [skill.name] }),
        );
        return true;
      });
    vi.spyOn(ToastHandlers, "displayErrorToast").mockImplementation(() => {});

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));
    await waitFor(() =>
      expect(
        within(card).getByTestId(`skill-toggle-${skill.name}`),
      ).toHaveAttribute("aria-checked", "true"),
    );

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        within(card).getByTestId(`skill-toggle-${skill.name}`),
      ).toHaveAttribute("aria-checked", "false"),
    );
  });

  it("reverts a failed save using the latest known settings, not a stale pre-toggle snapshot from another still-in-flight save", async () => {
    // Regression: onError's revert read `settings` from its own handleToggle
    // closure -- the snapshot from when THAT save was issued, not what the
    // server actually holds by the time the error fires. If a different
    // card's save lands successfully in the meantime, the revert must not
    // throw away that already-persisted change.
    const user = userEvent.setup();
    const skillA = buildSkill({ name: "skill-a" });
    const skillB = buildSkill({ name: "skill-b" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skillA, skillB]);
    const getSpy = vi
      .spyOn(SettingsService, "getSettings")
      .mockResolvedValue(buildSettings({ disabled_skills: [] }));

    let rejectA: (error: Error) => void = () => {};
    const pendingA = new Promise<boolean>((_resolve, reject) => {
      rejectA = reject;
    });

    vi.spyOn(SettingsService, "saveSettings").mockImplementation(
      async (settings: { disabled_skills?: string[] }) => {
        if ((settings.disabled_skills ?? []).length < 2) {
          // skill-a's own save: stays pending until rejectA() below fires.
          return pendingA;
        }
        // skill-b's save, issued while skill-a's is still in flight: this
        // one persists immediately, so the server now genuinely holds both
        // disabled.
        getSpy.mockResolvedValue(
          buildSettings({ disabled_skills: [...settings.disabled_skills!] }),
        );
        return true;
      },
    );
    vi.spyOn(ToastHandlers, "displayErrorToast").mockImplementation(() => {});

    renderSkillsSettingsScreen();
    const cardA = await screen.findByTestId(`skill-card-${skillA.name}`);
    const cardB = screen.getByTestId(`skill-card-${skillB.name}`);

    await user.click(within(cardA).getByTestId(`skill-toggle-${skillA.name}`));
    await user.click(within(cardB).getByTestId(`skill-toggle-${skillB.name}`));

    // skill-b's own save succeeds and settings refetches to reflect it.
    await waitFor(() =>
      expect(
        within(cardB).getByTestId(`skill-toggle-${skillB.name}`),
      ).toHaveAttribute("aria-checked", "false"),
    );

    // Now skill-a's own (still in-flight) save fails.
    rejectA(new Error("Request failed: Failed to fetch"));
    await waitFor(() =>
      expect(ToastHandlers.displayErrorToast).toHaveBeenCalled(),
    );

    // skill-b's card must keep reflecting the server's real, already-saved
    // state instead of being wiped back to enabled by skill-a's unrelated,
    // later-arriving failure reverting to a stale pre-toggle snapshot.
    expect(
      within(cardB).getByTestId(`skill-toggle-${skillB.name}`),
    ).toHaveAttribute("aria-checked", "false");
  });

  it("applies both toggles when two different skills are switched before a re-render lands", async () => {
    // Regression: handleToggle previously computed its next Set from the
    // render closure's `disabledSet` rather than a functional update, so two
    // toggles dispatched before React re-rendered between them both started
    // from the same stale snapshot -- whichever `setDisabledSet` call landed
    // last silently discarded the other card's toggle (and its save).
    const skillA = buildSkill({ name: "skill-a" });
    const skillB = buildSkill({ name: "skill-b" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skillA, skillB]);
    vi.spyOn(SettingsService, "getSettings").mockResolvedValue(
      buildSettings({ disabled_skills: [] }),
    );
    const saveSpy = vi
      .spyOn(SettingsService, "saveSettings")
      .mockResolvedValue(true);

    renderSkillsSettingsScreen();
    const cardA = await screen.findByTestId(`skill-card-${skillA.name}`);
    const cardB = screen.getByTestId(`skill-card-${skillB.name}`);
    const toggleA = within(cardA).getByTestId(`skill-toggle-${skillA.name}`);
    const toggleB = within(cardB).getByTestId(`skill-toggle-${skillB.name}`);

    act(() => {
      fireEvent.click(toggleA);
      fireEvent.click(toggleB);
    });

    await waitFor(() =>
      expect(
        within(cardA).getByTestId(`skill-toggle-${skillA.name}`),
      ).toHaveAttribute("aria-checked", "false"),
    );
    expect(
      within(cardB).getByTestId(`skill-toggle-${skillB.name}`),
    ).toHaveAttribute("aria-checked", "false");

    await waitFor(() => {
      const lastCall = saveSpy.mock.calls.at(-1)?.[0] as {
        disabled_skills?: string[];
      };
      expect(lastCall.disabled_skills).toEqual(
        expect.arrayContaining([skillA.name, skillB.name]),
      );
      expect(lastCall.disabled_skills).toHaveLength(2);
    });
  });

  it("toggles a skill from the card without opening the modal", async () => {
    const user = userEvent.setup();
    const skill = buildSkill({ name: "card-toggle" });
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    const card = await screen.findByTestId(`skill-card-${skill.name}`);

    await user.click(within(card).getByTestId(`skill-toggle-${skill.name}`));

    expect(card).not.toHaveClass("opacity-70");
    expect(
      within(card).getByTestId(`skill-toggle-${skill.name}`),
    ).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByTestId("skill-detail-modal")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when no skills match the current filters", async () => {
    const skill = buildSkill();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([skill]);

    renderSkillsSettingsScreen();
    await screen.findByTestId(`skill-card-${skill.name}`);

    fireEvent.change(screen.getByTestId("skills-search-input"), {
      target: { value: "no-such-skill-xyz" },
    });

    expect(screen.getByTestId("skills-no-match")).toBeInTheDocument();
  });

  it("opens the add skill modal with docs link and closes it", async () => {
    const user = userEvent.setup();
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();
    await screen.findByTestId("skills-add-skill-button");

    await user.click(screen.getByTestId("skills-add-skill-button"));

    const modal = await screen.findByTestId("add-skill-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("add-skill-modal-example")).toHaveTextContent(
      "/add-skill https://github.com/OpenHands/extensions/tree/main/skills/codereview",
    );
    expect(screen.getByTestId("add-skill-modal-docs-link")).toHaveAttribute(
      "href",
      ADD_SKILL_DOCS_URL,
    );

    await user.click(screen.getByTestId("add-skill-modal-dismiss"));

    expect(screen.queryByTestId("add-skill-modal")).not.toBeInTheDocument();
  });

  it("copies the example command from the add skill modal", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    vi.spyOn(SkillsService, "getSkills").mockResolvedValue([]);

    renderSkillsSettingsScreen();
    await user.click(await screen.findByTestId("skills-add-skill-button"));
    await screen.findByTestId("add-skill-modal");

    await user.click(screen.getByTestId("add-skill-modal-example-copy"));

    expect(writeText).toHaveBeenCalledWith(ADD_SKILL_EXAMPLE_COMMAND);
  });

  it("closes the detail modal instead of keeping another backend's skill on screen after a backend switch", async () => {
    const backendA: Backend = {
      id: "local-a",
      name: "Local A",
      host: "http://127.0.0.1:8001",
      apiKey: "",
      kind: "local",
    };
    const backendB: Backend = {
      id: "local-b",
      name: "Local B",
      host: "http://127.0.0.1:8002",
      apiKey: "",
      kind: "local",
    };
    __resetActiveStoreForTests();
    setRegisteredBackends([backendA, backendB]);
    setActiveSelection({ backendId: backendA.id });

    const skillA = buildSkill({ name: "from-backend-a" });
    const skillB = buildSkill({ name: "from-backend-b" });
    vi.spyOn(SkillsService, "getSkills")
      .mockResolvedValueOnce([skillA])
      .mockResolvedValueOnce([skillB]);

    try {
      renderSkillsSettingsScreen();
      const card = await screen.findByTestId(`skill-card-${skillA.name}`);
      await userEvent.setup().click(card);

      const modal = await screen.findByTestId("skill-detail-modal");
      expect(modal).toHaveAttribute("data-skill-name", skillA.name);

      act(() => setActiveSelection({ backendId: backendB.id }));

      await screen.findByTestId(`skill-card-${skillB.name}`);
      // `from-backend-a` no longer exists once the new backend's skill list
      // has loaded, so the modal (derived from the live list, not a stale
      // snapshot) must close rather than keep showing it.
      expect(
        screen.queryByTestId("skill-detail-modal"),
      ).not.toBeInTheDocument();
    } finally {
      setRegisteredBackends([]);
      setActiveSelection(null);
      __resetActiveStoreForTests();
    }
  });
});
