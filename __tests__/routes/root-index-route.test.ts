import { describe, expect, it } from "vitest";
import routes from "#/routes";

describe("root index route", () => {
  it("renders the welcome page at the deployment root without redirecting to /conversations", () => {
    const indexRoute = routes.find((route) => route.index);

    expect(indexRoute?.file).toBe("routes/welcome.tsx");
  });

  it("serves the home screen at /conversations inside the root layout", () => {
    const rootLayout = routes.find(
      (route) => route.file === "routes/root-layout.tsx",
    );
    const homeRoute = rootLayout?.children?.find(
      (route) => route.path === "conversations",
    );

    expect(homeRoute?.file).toBe("routes/home.tsx");
  });
});
