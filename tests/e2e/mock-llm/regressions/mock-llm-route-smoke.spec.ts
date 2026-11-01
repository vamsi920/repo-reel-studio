/**
 * Mock-LLM E2E: every page opens without crashing.
 *
 * Reads the route table from src/routes.ts, so a module added there is
 * covered without editing this file. For each path it fails on an uncaught
 * page error, on the module crash panel (`module-error`, see
 * src/routes/module-boundary.tsx) and on React Router's raw error screen.
 * Pages with ids get a placeholder id: a styled "not found" panel is a
 * correct answer there, a crash is not.
 */

import test, { expect } from "@playwright/test";
import type { RouteConfigEntry } from "@react-router/dev/routes";
import routes from "../../../../src/routes";
import { routeSessionApiKey, seedLocalStorage } from "../utils/mock-llm-helpers";

// Pages that redirect away or need a live external session; they are
// covered by their own specs.
const SKIPPED = new Set([
  "/login",
  "/logout",
  "/reset-password",
  "/oauth/device/verify",
]);

function collect(entries: RouteConfigEntry[], prefix: string, out: string[]) {
  for (const entry of entries) {
    const path = entry.index
      ? prefix || "/"
      : entry.path
        ? `${prefix}/${entry.path}`.replace(/\/+/g, "/")
        : prefix;
    if (entry.index || (entry.path && !entry.children?.length)) out.push(path);
    if (entry.path && entry.children?.length) out.push(path);
    if (entry.children) collect(entry.children, path, out);
  }
}

function appPaths(): string[] {
  const out: string[] = [];
  collect(routes as RouteConfigEntry[], "", out);
  return [
    ...new Set(
      out
        .map((p) => p.replace("*", "e2e-unknown-page"))
        .map((p) => p.replace(/:[A-Za-z]+/g, "e2e-missing-id"))
        .filter((p) => !SKIPPED.has(p)),
    ),
  ];
}

test.describe.configure({ mode: "serial" });

test.describe("Every page opens", () => {
  for (const path of appPaths()) {
    test(`${path} renders without crashing`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await seedLocalStorage(page);
      await routeSessionApiKey(page);

      await page.goto(path);
      await page.waitForLoadState("networkidle").catch(() => {});

      await expect(page.getByTestId("module-error")).toHaveCount(0);
      await expect(page.getByText("Unexpected Application Error")).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    });
  }
});
