import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { anchor } from "#/components/features/markdown/anchor";

describe("anchor", () => {
  it("renders a real link for an absolute http(s) href", () => {
    render(anchor({ href: "https://example.com/foo", children: "Example" }));
    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("href", "https://example.com/foo");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders a real link for a mailto href", () => {
    render(anchor({ href: "mailto:a@b.com", children: "Email" }));
    expect(screen.getByRole("link", { name: "Email" })).toHaveAttribute(
      "href",
      "mailto:a@b.com",
    );
  });

  it("renders a real link for an in-page #anchor href", () => {
    render(anchor({ href: "#section", children: "Jump" }));
    expect(screen.getByRole("link", { name: "Jump" })).toHaveAttribute(
      "href",
      "#section",
    );
  });

  it("renders a real link for a root-relative href", () => {
    render(anchor({ href: "/settings", children: "Settings" }));
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("renders bare relative repo-path hrefs as inert text, not a link", () => {
    render(
      anchor({
        href: ".github/workflows/sync-skill.yml",
        children: ".github/workflows/sync-skill.yml",
      }),
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText(".github/workflows/sync-skill.yml"),
    ).toBeInTheDocument();
  });

  it("renders a nested-path bare relative href as inert text", () => {
    render(anchor({ href: "src/index.ts", children: "src/index.ts" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an empty href as inert text", () => {
    render(anchor({ href: "", children: "path/to/file.ts" }));
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
