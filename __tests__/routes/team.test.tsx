import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TeamScreen from "#/routes/team";
import TeamMembersRoute from "#/routes/team-members";
import TeamSettingsRoute from "#/routes/team-settings";
import InviteRoute from "#/routes/invite";

const auth = vi.hoisted(() => ({
  configured: true,
  user: { id: "user-me", email: "me@x.com", is_anonymous: false } as {
    id: string;
    email: string;
    is_anonymous: boolean;
  } | null,
  signOut: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return auth.configured;
  },
  get supabase() {
    if (!auth.configured) return null;
    return {
      auth: {
        getSession: async () => ({
          data: { session: auth.user ? { user: auth.user } : null },
        }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        signOut: auth.signOut,
      },
    };
  },
}));

const identity = vi.hoisted(() => ({ resolveActiveTeam: vi.fn() }));
vi.mock("#/lib/data-platform/repositories/repository-identity", () => identity);

const repo = vi.hoisted(() => ({
  listMyTeams: vi.fn(),
  listMyInvites: vi.fn(),
  listMembers: vi.fn(),
  getInvite: vi.fn(),
  acceptInvite: vi.fn(),
  setActiveTeam: vi.fn(),
}));
vi.mock("#/lib/data-platform/repositories/team-repository", () => ({
  teamRepository: repo,
}));

const assign = vi.fn();

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: "/team",
        element: <TeamScreen />,
        children: [
          { index: true, element: <TeamMembersRoute /> },
          { path: "settings", element: <TeamSettingsRoute /> },
        ],
      },
      { path: "/invite/:token", element: <InviteRoute /> },
      { path: "/login", element: <div data-testid="login-page" /> },
    ],
    { initialEntries: [path] },
  );
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.configured = true;
  auth.user = { id: "user-me", email: "me@x.com", is_anonymous: false };
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  identity.resolveActiveTeam.mockReset();
  Object.values(repo).forEach((fn) => fn.mockReset());
  repo.listMyTeams.mockResolvedValue([]);
  repo.listMyInvites.mockResolvedValue([]);
  repo.listMembers.mockResolvedValue([]);
  repo.setActiveTeam.mockResolvedValue(undefined);
  assign.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, pathname: "/invite/tok-1" },
  });
});

describe("Team page", () => {
  it("explains that teams need sign-in when none is configured", async () => {
    auth.configured = false;

    renderAt("/team");

    expect(await screen.findByTestId("team-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("team-tab-members")).toBeNull();
    expect(identity.resolveActiveTeam).not.toHaveBeenCalled();
  });

  it("shows the active team with its tabs and the member list", async () => {
    identity.resolveActiveTeam.mockResolvedValue({
      id: "team-1",
      name: "Platform",
      isPersonal: false,
      role: "admin",
    });
    repo.listMembers.mockResolvedValue([
      {
        userId: "user-me",
        email: "me@x.com",
        role: "admin",
        joinedAt: "2026-11-01T10:00:00Z",
        invitedByEmail: null,
      },
    ]);

    renderAt("/team");

    await waitFor(() =>
      expect(screen.getByTestId("team-title")).toHaveTextContent("Platform"),
    );
    expect(screen.getByTestId("team-tab-workspaces")).toBeInTheDocument();
    expect(await screen.findByTestId("team-member-row")).toHaveTextContent(
      "me@x.com",
    );
    expect(repo.listMembers).toHaveBeenCalledWith("team-1");
  });

  it("offers a retry when the team cannot be resolved", async () => {
    const user = userEvent.setup();
    identity.resolveActiveTeam.mockResolvedValue(null);

    renderAt("/team");

    expect(await screen.findByTestId("team-load-failed")).toBeInTheDocument();
    identity.resolveActiveTeam.mockResolvedValue({
      id: "team-1",
      name: "Platform",
      isPersonal: false,
      role: "member",
    });
    await user.click(screen.getByRole("button"));

    expect(await screen.findByTestId("team-tab-members")).toBeInTheDocument();
  });
});

describe("Invitation link", () => {
  it("accepts a matching invitation and opens the team", async () => {
    const user = userEvent.setup();
    repo.getInvite.mockResolvedValue({
      status: "pending",
      teamId: "team-9",
      teamName: "Design",
      role: "member",
      email: "me@x.com",
      invitedByEmail: "ann@x.com",
      emailMatches: true,
      alreadyMember: false,
    });
    repo.acceptInvite.mockResolvedValue("team-9");

    renderAt("/invite/tok-1");

    await user.click(await screen.findByTestId("invite-accept"));

    await waitFor(() =>
      expect(repo.acceptInvite).toHaveBeenCalledWith("tok-1"),
    );
    await waitFor(() =>
      expect(repo.setActiveTeam).toHaveBeenCalledWith("team-9"),
    );
    expect(assign).toHaveBeenCalledWith("/conversations");
  });

  it("refuses the wrong account and brings the right one back to the link", async () => {
    const user = userEvent.setup();
    repo.getInvite.mockResolvedValue({
      status: "pending",
      teamId: "team-9",
      teamName: "Design",
      role: "member",
      email: "someone-else@x.com",
      emailMatches: false,
      alreadyMember: false,
    });

    renderAt("/invite/tok-1");

    expect(
      await screen.findByTestId("invite-email-mismatch"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("invite-accept")).toBeNull();

    await user.click(screen.getByTestId("invite-switch-account"));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(await screen.findByTestId("login-page")).toBeInTheDocument();
    expect(window.sessionStorage.getItem("neo-post-login-path")).toBe(
      "/invite/tok-1",
    );
  });

  it.each([
    ["expired", "invite-closed"],
    ["revoked", "invite-closed"],
    ["not_found", "invite-not-found"],
  ])("offers nothing to accept for a %s invitation", async (status, testId) => {
    repo.getInvite.mockResolvedValue({
      status,
      teamName: "Design",
      emailMatches: true,
      alreadyMember: false,
    });

    renderAt("/invite/tok-1");

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
    expect(screen.queryByTestId("invite-accept")).toBeNull();
  });
});
