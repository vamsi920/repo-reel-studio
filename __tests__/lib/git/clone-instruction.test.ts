import { describe, expect, it } from "vitest";
import {
  gitIdentityCommands,
  resolveGitIdentity,
} from "#/lib/git/clone-instruction";

describe("git identity for repo checkouts", () => {
  it("uses the user's identity, and Neo instead of the upstream openhands default", () => {
    expect(
      resolveGitIdentity({
        git_user_name: "Vamsi D",
        git_user_email: "v@acme.dev",
      }),
    ).toEqual({ name: "Vamsi D", email: "v@acme.dev" });
    expect(
      resolveGitIdentity({
        git_user_name: "openhands",
        git_user_email: "openhands@all-hands.dev",
      }),
    ).toEqual({ name: "Neo", email: "neo@neodevex.com" });
    expect(resolveGitIdentity({})).toEqual({
      name: "Neo",
      email: "neo@neodevex.com",
    });
  });

  it("never lets a setting break out of the shell command", () => {
    const commands = gitIdentityCommands(
      resolveGitIdentity({
        git_user_name: "x'; rm -rf / #",
        git_user_email: "a@b.c",
      }),
    );
    expect(commands).toBe(
      "; git config user.name 'x rm -rf'; git config user.email 'a@b.c'",
    );
  });
});
