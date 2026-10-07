import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeamGithubNotice } from "#/components/features/home/team-github-notice";
import { NavigationProvider } from "#/context/navigation-context";

const state = vi.hoisted(() => ({
  personal: { isSuccess: true, isError: false, data: null as unknown },
  connections: [] as { providerId: string }[],
}));

vi.mock("#/hooks/query/use-github-connection", () => ({
  useGithubConnection: () => state.personal,
}));
vi.mock("#/hooks/query/use-connections", () => ({
  useConnections: () => ({ data: state.connections }),
}));

function renderNotice(navigate = vi.fn()) {
  render(
    <NavigationProvider
      value={{
        currentPath: "/",
        conversationId: null,
        isNavigating: false,
        navigate,
      }}
    >
      <TeamGithubNotice />
    </NavigationProvider>,
  );
  return navigate;
}

beforeEach(() => {
  state.personal = { isSuccess: true, isError: false, data: null };
  state.connections = [];
});

describe("TeamGithubNotice", () => {
  it("tells a teammate to connect their own GitHub when only the org has one", async () => {
    state.connections = [{ providerId: "github" }];
    const navigate = renderNotice();

    await userEvent.click(screen.getByTestId("team-github-notice-connect"));

    expect(navigate).toHaveBeenCalledWith("/settings/connections");
  });

  it.each([
    [
      "the user already connected their own GitHub",
      { data: { githubUsername: "me" } },
      [{ providerId: "github" }],
    ],
    ["the org has no GitHub connection either", {}, []],
    [
      "the personal lookup failed",
      { isSuccess: false, isError: true },
      [{ providerId: "github" }],
    ],
  ])("stays hidden when %s", (_label, personal, connections) => {
    state.personal = { ...state.personal, ...personal };
    state.connections = connections;
    renderNotice();
    expect(screen.queryByTestId("team-github-notice")).not.toBeInTheDocument();
  });
});
