import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  configured: true,
  rpc: vi.fn(),
}));

vi.mock("#/lib/data-platform/client", () => ({
  get isSupabaseConfigured() {
    return state.configured;
  },
  get supabase() {
    return state.configured ? { rpc: state.rpc } : null;
  },
}));

import { teamRepository } from "#/lib/data-platform/repositories/team-repository";

beforeEach(() => {
  state.configured = true;
  state.rpc.mockReset();
});

describe("teamRepository", () => {
  it("shapes invite outcomes and passes the addresses and role through", async () => {
    state.rpc.mockResolvedValue({
      data: [
        { email: "a@x.com", status: "invited", invite_id: "i1", token: "t1" },
        {
          email: "b@x.com",
          status: "already_member",
          invite_id: null,
          token: null,
        },
      ],
      error: null,
    });

    const outcomes = await teamRepository.createInvites(
      "team-1",
      ["a@x.com", "b@x.com"],
      "viewer",
    );

    expect(state.rpc).toHaveBeenCalledWith("create_team_invites", {
      target_org: "team-1",
      emails: ["a@x.com", "b@x.com"],
      invite_role: "viewer",
    });
    expect(outcomes).toEqual([
      { email: "a@x.com", status: "invited", inviteId: "i1", token: "t1" },
      {
        email: "b@x.com",
        status: "already_member",
        inviteId: null,
        token: null,
      },
    ]);
  });

  it("rejects with the database's reason code", async () => {
    state.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "last_owner" },
    });

    await expect(teamRepository.leaveTeam("team-1")).rejects.toMatchObject({
      name: "TeamError",
      code: "last_owner",
    });
  });

  it("treats an unknown invitation link as not found rather than failing", async () => {
    state.rpc.mockResolvedValue({ data: { status: "not_found" }, error: null });

    await expect(teamRepository.getInvite("nope")).resolves.toMatchObject({
      status: "not_found",
      emailMatches: false,
      alreadyMember: false,
    });
  });

  it("refuses cleanly when sign-in is not configured", async () => {
    state.configured = false;

    await expect(teamRepository.listMyTeams()).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
