import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentProfilesBody } from "#/components/features/settings/agent-profiles/agent-profiles-body";
import type { AgentProfileSummary } from "#/api/agent-profiles-service/agent-profiles-service.api";

function makeProfile(
  overrides: Partial<AgentProfileSummary> = {},
): AgentProfileSummary {
  return {
    id: "profile-1",
    name: "default",
    agent_kind: "openhands",
    revision: 1,
    llm_profile_ref: "my-llm",
    mcp_server_refs: null,
    ...overrides,
  };
}

const baseProps = {
  canManage: true,
  onActivate: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  isActivating: false,
};

describe("AgentProfilesBody", () => {
  it("renders a loading indicator while loading", () => {
    render(
      <AgentProfilesBody
        {...baseProps}
        isLoading
        loadError={null}
        profiles={[]}
        activeId={null}
      />,
    );

    expect(
      screen.queryByTestId("agent-profiles-empty"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("agent-profiles-load-error"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("agent-profile-row")).not.toBeInTheDocument();
  });

  it("renders the load error state instead of the empty state", () => {
    render(
      <AgentProfilesBody
        {...baseProps}
        isLoading={false}
        loadError={new Error("boom")}
        profiles={[]}
        activeId={null}
      />,
    );

    expect(screen.getByTestId("agent-profiles-load-error")).toBeVisible();
    expect(
      screen.queryByTestId("agent-profiles-empty"),
    ).not.toBeInTheDocument();
  });

  it("renders the empty state when there are no profiles and no error", () => {
    render(
      <AgentProfilesBody
        {...baseProps}
        isLoading={false}
        loadError={null}
        profiles={[]}
        activeId={null}
      />,
    );

    expect(screen.getByTestId("agent-profiles-empty")).toBeVisible();
  });

  it("marks only the profile whose id matches activeId as active", () => {
    const profiles = [
      makeProfile({ id: "profile-1", name: "one" }),
      makeProfile({ id: "profile-2", name: "two" }),
    ];

    render(
      <AgentProfilesBody
        {...baseProps}
        isLoading={false}
        loadError={null}
        profiles={profiles}
        activeId="profile-2"
      />,
    );

    const rows = screen.getAllByTestId("agent-profile-row");
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId("agent-profile-active-badge")).toHaveLength(1);
  });

  it("marks no profile as active when a profile has a null id, even if activeId is falsy", () => {
    // A profile with a null `id` must never render as "active" just because
    // `activeId` also happens to be null/unset -- `!!profile.id` guards this.
    const profiles = [makeProfile({ id: null, name: "unsaved" })];

    render(
      <AgentProfilesBody
        {...baseProps}
        isLoading={false}
        loadError={null}
        profiles={profiles}
        activeId={null}
      />,
    );

    expect(
      screen.queryByTestId("agent-profile-active-badge"),
    ).not.toBeInTheDocument();
  });

  it("hides the actions menu trigger when canManage is false", () => {
    render(
      <AgentProfilesBody
        {...baseProps}
        canManage={false}
        isLoading={false}
        loadError={null}
        profiles={[makeProfile()]}
        activeId={null}
      />,
    );

    expect(
      screen.queryByTestId("agent-profile-menu-trigger"),
    ).not.toBeInTheDocument();
  });
});
