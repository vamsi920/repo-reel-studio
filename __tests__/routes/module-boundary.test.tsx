import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";
import ModuleBoundary, { ErrorBoundary } from "#/routes/module-boundary";

function renderShellAt(Page: () => React.ReactNode, loader?: () => never) {
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => (
        <div>
          <nav data-testid="shell-sidebar" />
          <ModuleBoundary />
        </div>
      ),
      children: [
        {
          Component: ModuleBoundary,
          ErrorBoundary,
          children: [{ path: "page", Component: Page, loader }],
        },
      ],
    },
  ]);
  render(<Stub initialEntries={["/page"]} />);
}

describe("ModuleBoundary", () => {
  it("keeps the shell and shows a recoverable panel when a page crashes", async () => {
    renderShellAt(() => {
      throw new Error("boom");
    });

    expect(await screen.findByTestId("module-error")).toBeInTheDocument();
    expect(screen.getByTestId("shell-sidebar")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("shows not-found, not a crash, for a 404", async () => {
    renderShellAt(
      () => null,
      () => {
        throw new Response(null, { status: 404, statusText: "Not Found" });
      },
    );

    expect(await screen.findByTestId("module-not-found")).toBeInTheDocument();
    expect(screen.queryByTestId("module-error")).not.toBeInTheDocument();
  });
});
