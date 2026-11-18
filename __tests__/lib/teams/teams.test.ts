import { afterEach, describe, expect, it } from "vitest";
import { I18nKey } from "#/i18n/declaration";
import {
  POST_LOGIN_PATH_KEY,
  TeamError,
  assignableRoles,
  buildInviteLink,
  canLeaveTeam,
  canManageTeam,
  canRemoveMember,
  consumePostLoginPath,
  invitableRoles,
  inviteLinkOrigin,
  parseInviteEmails,
  rememberPostLoginPath,
  teamErrorMessageKey,
  toTeamError,
} from "#/lib/teams";

describe("team roles", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["viewer", false],
    [null, false],
  ] as const)("%s manages the team: %s", (role, expected) => {
    expect(canManageTeam(role)).toBe(expected);
    expect(invitableRoles(role).length > 0).toBe(expected);
  });

  it("lets an owner move a member to any other role, ownership included", () => {
    expect(
      assignableRoles({
        actorRole: "owner",
        actorIsTarget: false,
        targetRole: "member",
        ownerCount: 1,
      }),
    ).toEqual(["owner", "admin", "viewer"]);
  });

  it("never lets an admin hand out or take away ownership", () => {
    expect(
      assignableRoles({
        actorRole: "admin",
        actorIsTarget: false,
        targetRole: "member",
        ownerCount: 1,
      }),
    ).toEqual(["admin", "viewer"]);
    expect(
      assignableRoles({
        actorRole: "admin",
        actorIsTarget: false,
        targetRole: "owner",
        ownerCount: 2,
      }),
    ).toEqual([]);
    expect(
      canRemoveMember({
        actorRole: "admin",
        actorIsTarget: false,
        targetRole: "owner",
        ownerCount: 2,
      }),
    ).toBe(false);
  });

  it("protects the last owner from being demoted, removed or leaving", () => {
    const soleOwner = {
      actorRole: "owner" as const,
      actorIsTarget: true,
      targetRole: "owner" as const,
      ownerCount: 1,
    };
    expect(assignableRoles(soleOwner)).toEqual([]);
    expect(canRemoveMember({ ...soleOwner, actorIsTarget: false })).toBe(false);
    expect(canLeaveTeam("owner", false, 1)).toBe(false);
    expect(canLeaveTeam("owner", false, 2)).toBe(true);
  });

  it("lets someone lower their own role but never raise it", () => {
    expect(
      assignableRoles({
        actorRole: "admin",
        actorIsTarget: true,
        targetRole: "admin",
        ownerCount: 1,
      }),
    ).toEqual(["member", "viewer"]);
  });

  it("never offers leaving a personal team", () => {
    expect(canLeaveTeam("owner", true, 2)).toBe(false);
    expect(canLeaveTeam("member", false, 1)).toBe(true);
  });
});

describe("invite emails", () => {
  it("splits pasted input, lower-cases, de-duplicates and reports bad entries", () => {
    const parsed = parseInviteEmails(
      "Ada@Example.com, grace@example.com;\nada@example.com  bob@ <carol@example.com> not-an-email",
    );

    expect(parsed.valid).toEqual([
      "ada@example.com",
      "grace@example.com",
      "carol@example.com",
    ]);
    // "not-an-email" is a stray word, not an attempt at an address.
    expect(parsed.invalid).toEqual(["bob@"]);
  });

  it("points a link made in the desktop app's local mode at the hosted app", () => {
    const local = { origin: "http://localhost:8000", hostname: "localhost" };

    // Nobody else can open this computer's localhost.
    expect(inviteLinkOrigin(local, true)).toBe("https://neo.neodevex.com");
    // A developer's own browser on localhost keeps its origin.
    expect(inviteLinkOrigin(local, false)).toBe("http://localhost:8000");
    expect(
      inviteLinkOrigin(
        { origin: "https://neo.example", hostname: "neo.example" },
        true,
      ),
    ).toBe("https://neo.example");
  });

  it("builds a link that survives a token needing escaping", () => {
    expect(buildInviteLink("a/b c", "https://neo.example")).toBe(
      "https://neo.example/invite/a%2Fb%20c",
    );
  });
});

describe("post-login return path", () => {
  afterEach(() => window.sessionStorage.clear());

  it("remembers an invitation link once and nothing else", () => {
    rememberPostLoginPath("/settings/secrets");
    expect(consumePostLoginPath()).toBeNull();

    rememberPostLoginPath("/invite/tok123");
    expect(consumePostLoginPath()).toBe("/invite/tok123");
    expect(consumePostLoginPath()).toBeNull();
  });

  it("ignores a stored value that is not an invitation link", () => {
    window.sessionStorage.setItem(POST_LOGIN_PATH_KEY, "https://evil.example");
    expect(consumePostLoginPath()).toBeNull();
  });
});

describe("team errors", () => {
  it("maps a database code to its own message", () => {
    const error = toTeamError({ message: "last_owner", code: "P0001" });
    expect(error).toBeInstanceOf(TeamError);
    expect(error.code).toBe("last_owner");
    expect(teamErrorMessageKey(error)).toBe(I18nKey.TEAM$ERROR_LAST_OWNER);
  });

  it("never shows a raw database message for an unknown failure", () => {
    const error = toTeamError({ message: 'relation "orgs" does not exist' });
    expect(error.code).toBe("unknown");
    expect(teamErrorMessageKey(error)).toBe(I18nKey.TEAM$ERROR_GENERIC);
  });
});
