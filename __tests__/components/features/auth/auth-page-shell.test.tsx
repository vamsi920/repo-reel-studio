import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AuthPageShell } from "#/components/features/auth/auth-page-shell";

describe("AuthPageShell", () => {
  it("renders its children inside the page frame", () => {
    render(
      <MemoryRouter>
        <AuthPageShell>
          <div data-testid="auth-shell-child">form content</div>
        </AuthPageShell>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("auth-shell-child")).toHaveTextContent(
      "form content",
    );
  });

  it("links the brand wordmark back to the home page", () => {
    render(
      <MemoryRouter>
        <AuthPageShell>
          <div />
        </AuthPageShell>
      </MemoryRouter>,
    );

    const homeLink = screen.getByRole("link", { name: /neo/i });
    expect(homeLink).toHaveAttribute("href", "/");
  });
});
