import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "test-utils";

import { InviteMembersModal } from "#/components/features/teams/invite-members-modal";
import { MyInvitesPanel } from "#/components/features/teams/my-invites-panel";
import { TeamInvitationsPanel } from "#/components/features/teams/team-invitations-panel";
import { TeamMembersPanel } from "#/components/features/teams/team-members-panel";
import { TeamSettingsPanel } from "#/components/features/teams/team-settings-panel";
import { TeamWorkspacesPanel } from "#/components/features/teams/team-workspaces-panel";
import type { ActiveTeam } from "#/lib/data-platform/repositories/repository-identity";
import type { TeamMember } from "#/lib/teams/types";

const ME = "user-me";

// A signed-in, non-anonymous session: team features are off without one.
vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "user-me", email: "me@x.com", is_anonymous: false },
          },
        },
      }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

const repo = vi.hoisted(() => ({
  listMembers: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  leaveTeam: vi.fn(),
  setActiveTeam: vi.fn(),
  createInvites: vi.fn(),
  listInvites: vi.fn(),
  revokeInvite: vi.fn(),
  regenerateInvite: vi.fn(),
  listMyInvites: vi.fn(),
  respondToInvite: vi.fn(),
  listWorkspaces: vi.fn(),
  deleteWorkspace: vi.fn(),
  renameTeam: vi.fn(),
  deleteTeam: vi.fn(),
  transferOwnership: vi.fn(),
}));

vi.mock("#/lib/data-platform/repositories/team-repository", () => ({
  teamRepository: repo,
}));

const assign = vi.fn();

function team(overrides: Partial<ActiveTeam> = {}): ActiveTeam {
  return {
    id: "team-1",
    name: "Platform",
    isPersonal: false,
    role: "owner",
    ...overrides,
  };
}

function member(
  userId: string,
  role: TeamMember["role"],
  email = `${userId}@x.com`,
): TeamMember {
  return {
    userId,
    email,
    role,
    joinedAt: "2026-11-01T10:00:00Z",
    invitedByEmail: null,
  };
}

beforeEach(() => {
  Object.values(repo).forEach((fn) => fn.mockReset());
  assign.mockReset();
  repo.setActiveTeam.mockResolvedValue(undefined);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, origin: "https://neo.example" },
  });
});

describe("TeamMembersPanel", () => {
  it("gives an owner role and removal controls for others, but not for themselves as the only owner", async () => {
    repo.listMembers.mockResolvedValue([
      member(ME, "owner", "me@x.com"),
      member("bob", "member"),
    ]);

    renderWithProviders(
      <TeamMembersPanel
        team={team()}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );

    const rows = await screen.findAllByTestId("team-member-row");
    expect(rows).toHaveLength(2);
    const [mine, bobs] = rows;
    expect(within(mine).queryByTestId("member-role-select")).toBeNull();
    expect(within(mine).queryByTestId("leave-team-button")).toBeNull();
    expect(within(bobs).getByTestId("member-role-select")).toBeEnabled();
    expect(within(bobs).getByTestId("remove-member-button")).toBeEnabled();
    expect(screen.getByTestId("invite-members-button")).toBeInTheDocument();
  });

  it("shows a plain member no management controls, only a way to leave", async () => {
    repo.listMembers.mockResolvedValue([
      member("ann", "owner"),
      member(ME, "member", "me@x.com"),
    ]);

    renderWithProviders(
      <TeamMembersPanel
        team={team({ role: "member" })}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );

    await screen.findAllByTestId("team-member-row");
    expect(screen.queryByTestId("member-role-select")).toBeNull();
    expect(screen.queryByTestId("remove-member-button")).toBeNull();
    expect(screen.queryByTestId("invite-members-button")).toBeNull();
    expect(screen.getByTestId("leave-team-button")).toBeInTheDocument();
  });

  it("changes a role straight away, but asks before handing out ownership", async () => {
    const user = userEvent.setup();
    repo.listMembers.mockResolvedValue([
      member(ME, "owner", "me@x.com"),
      member("bob", "member"),
    ]);
    repo.updateMemberRole.mockResolvedValue(undefined);

    renderWithProviders(
      <TeamMembersPanel
        team={team()}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );

    const select = await screen.findByTestId("member-role-select");
    await user.selectOptions(select, "admin");
    await waitFor(() =>
      expect(repo.updateMemberRole).toHaveBeenCalledWith(
        "team-1",
        "bob",
        "admin",
      ),
    );

    repo.updateMemberRole.mockClear();
    await user.selectOptions(screen.getByTestId("member-role-select"), "owner");
    expect(repo.updateMemberRole).not.toHaveBeenCalled();
    await user.click(await screen.findByTestId("member-confirm-confirm"));
    await waitFor(() =>
      expect(repo.updateMemberRole).toHaveBeenCalledWith(
        "team-1",
        "bob",
        "owner",
      ),
    );
  });

  it("leaves the team and returns to the personal team", async () => {
    const user = userEvent.setup();
    repo.listMembers.mockResolvedValue([
      member("ann", "owner"),
      member(ME, "admin", "me@x.com"),
    ]);
    repo.leaveTeam.mockResolvedValue(undefined);

    renderWithProviders(
      <TeamMembersPanel
        team={team({ role: "admin" })}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );

    await user.click(await screen.findByTestId("leave-team-button"));
    await user.click(await screen.findByTestId("member-confirm-confirm"));

    await waitFor(() => expect(repo.leaveTeam).toHaveBeenCalledWith("team-1"));
    await waitFor(() =>
      expect(repo.setActiveTeam).toHaveBeenCalledWith("personal-1"),
    );
    expect(assign).toHaveBeenCalledWith("/conversations");
  });
});

describe("InviteMembersModal", () => {
  it("blocks sending while an address is malformed", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <InviteMembersModal
        teamId="team-1"
        teamName="Platform"
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("invite-emails"), "ada@x.com, bob@");

    expect(screen.getByTestId("invite-invalid")).toBeInTheDocument();
    expect(screen.getByTestId("invite-submit")).toBeDisabled();
    expect(repo.createInvites).not.toHaveBeenCalled();
  });

  it("invites the parsed addresses with the chosen role and shows each person's link", async () => {
    const user = userEvent.setup();
    repo.createInvites.mockResolvedValue([
      {
        email: "ada@x.com",
        status: "invited",
        inviteId: "i1",
        token: "tok-ada",
      },
      {
        email: "bob@x.com",
        status: "already_member",
        inviteId: null,
        token: null,
      },
    ]);
    renderWithProviders(
      <InviteMembersModal
        teamId="team-1"
        teamName="Platform"
        onClose={vi.fn()}
      />,
    );

    await user.type(screen.getByTestId("invite-emails"), "Ada@x.com bob@x.com");
    await user.selectOptions(screen.getByTestId("invite-role"), "viewer");
    await user.click(screen.getByTestId("invite-submit"));

    await waitFor(() =>
      expect(repo.createInvites).toHaveBeenCalledWith(
        "team-1",
        ["ada@x.com", "bob@x.com"],
        "viewer",
      ),
    );
    expect(await screen.findByTestId("invite-link")).toHaveValue(
      "https://neo.example/invite/tok-ada",
    );
    expect(
      screen.getByTestId("invite-outcome-already_member"),
    ).toHaveTextContent("bob@x.com");
  });
});

describe("TeamInvitationsPanel", () => {
  it("does not load or offer invitations to someone who cannot manage the team", () => {
    renderWithProviders(
      <TeamInvitationsPanel team={team({ role: "member" })} />,
    );

    expect(screen.getByTestId("invitations-forbidden")).toBeInTheDocument();
    expect(repo.listInvites).not.toHaveBeenCalled();
  });

  it("explains that a personal team cannot invite anyone", () => {
    renderWithProviders(
      <TeamInvitationsPanel team={team({ isPersonal: true })} />,
    );

    expect(screen.getByTestId("invitations-personal")).toBeInTheDocument();
    expect(screen.queryByTestId("invite-members-button")).toBeNull();
  });

  it("shows a fresh link when one is regenerated, and can cancel an invitation", async () => {
    const user = userEvent.setup();
    repo.listInvites.mockResolvedValue([
      {
        id: "i1",
        email: "ada@x.com",
        role: "member",
        status: "expired",
        invitedByEmail: "me@x.com",
        createdAt: "2026-11-01T10:00:00Z",
        expiresAt: "2026-11-08T10:00:00Z",
      },
    ]);
    repo.regenerateInvite.mockResolvedValue("fresh-token");
    repo.revokeInvite.mockResolvedValue(undefined);

    renderWithProviders(<TeamInvitationsPanel team={team()} />);

    await user.click(await screen.findByTestId("invite-new-link-button"));
    expect(await screen.findByTestId("invite-link")).toHaveValue(
      "https://neo.example/invite/fresh-token",
    );

    await user.click(screen.getByTestId("invite-revoke-button"));
    await waitFor(() => expect(repo.revokeInvite).toHaveBeenCalledWith("i1"));
  });
});

describe("MyInvitesPanel", () => {
  it("renders nothing when nobody has invited the user", async () => {
    repo.listMyInvites.mockResolvedValue([]);

    renderWithProviders(<MyInvitesPanel />);

    await waitFor(() => expect(repo.listMyInvites).toHaveBeenCalled());
    expect(screen.queryByTestId("my-invites-panel")).toBeNull();
  });

  it("accepts an invitation and moves the app into that team", async () => {
    const user = userEvent.setup();
    repo.listMyInvites.mockResolvedValue([
      {
        id: "i9",
        teamId: "team-9",
        teamName: "Design",
        role: "member",
        invitedByEmail: "ann@x.com",
        createdAt: "2026-11-01T10:00:00Z",
        expiresAt: "2026-11-08T10:00:00Z",
      },
    ]);
    repo.respondToInvite.mockResolvedValue("team-9");

    renderWithProviders(<MyInvitesPanel />);

    await user.click(await screen.findByTestId("my-invite-accept"));

    await waitFor(() =>
      expect(repo.respondToInvite).toHaveBeenCalledWith("i9", true),
    );
    await waitFor(() =>
      expect(repo.setActiveTeam).toHaveBeenCalledWith("team-9"),
    );
    expect(assign).toHaveBeenCalledWith("/conversations");
  });
});

describe("TeamWorkspacesPanel", () => {
  it("filters by search and only offers delete to those allowed", async () => {
    const user = userEvent.setup();
    const base = {
      backendId: "default-local",
      memberCount: 1,
      createdByEmail: "ann@x.com",
      createdAt: "2026-11-01T10:00:00Z",
      updatedAt: "2026-11-02T10:00:00Z",
    };
    repo.listWorkspaces.mockResolvedValue([
      {
        ...base,
        id: "ws-1",
        name: "billing-api",
        path: "/srv/billing-api",
        visibility: "team",
        myRole: "member",
      },
      {
        ...base,
        id: "ws-2",
        name: null,
        path: "/srv/web-app",
        visibility: "restricted",
        myRole: "owner",
      },
    ]);

    renderWithProviders(
      <TeamWorkspacesPanel team={team({ role: "member" })} />,
    );

    const rows = await screen.findAllByTestId("team-workspace-row");
    expect(rows).toHaveLength(2);
    // A member may not delete a teammate's workspace, but may delete their own.
    expect(within(rows[0]).queryByTestId("workspace-delete-button")).toBeNull();
    expect(
      within(rows[1]).getByTestId("workspace-delete-button"),
    ).toBeEnabled();
    // An unnamed workspace is labelled by its folder.
    expect(rows[1]).toHaveTextContent("web-app");

    await user.type(screen.getByTestId("workspace-search"), "billing");
    expect(screen.getAllByTestId("team-workspace-row")).toHaveLength(1);
  });
});

describe("TeamSettingsPanel", () => {
  it("deletes the team only after its name is typed", async () => {
    const user = userEvent.setup();
    repo.listMembers.mockResolvedValue([member(ME, "owner", "me@x.com")]);
    repo.deleteTeam.mockResolvedValue(undefined);

    renderWithProviders(
      <TeamSettingsPanel
        team={team()}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );

    await user.click(screen.getByTestId("delete-team-button"));
    const confirm = screen.getByTestId("delete-team-confirm-confirm");
    expect(confirm).toBeDisabled();

    await user.type(
      screen.getByTestId("delete-team-confirm-input"),
      "Platform",
    );
    await user.click(confirm);

    await waitFor(() =>
      expect(repo.deleteTeam).toHaveBeenCalledWith("team-1", "Platform"),
    );
    await waitFor(() =>
      expect(repo.setActiveTeam).toHaveBeenCalledWith("personal-1"),
    );
  });

  it("keeps the only owner from leaving and hides owner actions from an admin", async () => {
    repo.listMembers.mockResolvedValue([member(ME, "owner", "me@x.com")]);
    const { unmount } = renderWithProviders(
      <TeamSettingsPanel
        team={team()}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );
    await waitFor(() => expect(repo.listMembers).toHaveBeenCalled());
    expect(screen.getByTestId("leave-team-button")).toBeDisabled();
    unmount();

    repo.listMembers.mockResolvedValue([
      member("ann", "owner"),
      member(ME, "admin", "me@x.com"),
    ]);
    renderWithProviders(
      <TeamSettingsPanel
        team={team({ role: "admin" })}
        currentUserId={ME}
        personalTeamId="personal-1"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("leave-team-button")).toBeEnabled(),
    );
    expect(screen.queryByTestId("delete-team-button")).toBeNull();
    expect(screen.queryByTestId("transfer-owner-button")).toBeNull();
  });

  it("offers nothing destructive for a personal team", () => {
    renderWithProviders(
      <TeamSettingsPanel
        team={team({ isPersonal: true })}
        currentUserId={ME}
        personalTeamId="team-1"
      />,
    );

    expect(screen.queryByTestId("delete-team-button")).toBeNull();
    expect(screen.queryByTestId("leave-team-button")).toBeNull();
    expect(screen.queryByTestId("team-name-input")).toBeNull();
  });
});
