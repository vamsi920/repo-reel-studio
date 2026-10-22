import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("#/lib/data-platform/client", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: () => getSession(),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
  },
}));

const { LandingConsoleLink } =
  await import("#/components/features/landing/landing-console-link");

function renderLink() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LandingConsoleLink label="Try Neo" className="btn" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("LandingConsoleLink", () => {
  it("shows Console to a returning signed-in user", async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: "u1", is_anonymous: false } } },
    });

    renderLink();

    expect(await screen.findByText("Console")).toHaveAttribute(
      "href",
      "/conversations",
    );
  });

  it.each([
    ["no session", null],
    ["an anonymous session", { user: { id: "a1", is_anonymous: true } }],
  ])("shows Try Neo with %s", async (_label, session) => {
    getSession.mockResolvedValue({ data: { session } });

    renderLink();

    expect(await screen.findByText("Try Neo")).toBeInTheDocument();
    expect(screen.queryByText("Console")).not.toBeInTheDocument();
  });
});
