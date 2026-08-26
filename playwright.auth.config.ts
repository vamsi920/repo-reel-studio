import { defineConfig, devices } from "@playwright/test";

/**
 * Authenticated live-app checks -- real Supabase email/password login
 * against a real, already-deployed URL (defaults to production). No
 * webServer: this doesn't spin up a local stack, it exercises whatever's
 * actually live, which is the point (this suite exists because a stale
 * Netlify/Fly credential broke production in a way local dev never would
 * have caught).
 *
 * Credentials come from env, never from a person typing them into a chat or
 * an agent driving a real login form -- see tests/e2e/auth/README.md for
 * why this suite exists and how to run it.
 */
const baseURL = process.env.E2E_BASE_URL?.trim() || "https://neo.neodevex.com";

// Escape hatch for a machine whose local DNS resolver doesn't have the
// target host (e.g. a stale/misbehaving local resolver even though public
// DNS resolves it fine) -- optional, unset by default. Chromium syntax:
// "MAP host ip[,MAP host2 ip2,...]".
const hostResolverRules = process.env.E2E_HOST_RESOLVER_RULES?.trim();

export default defineConfig({
  testDir: "./tests/e2e/auth",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [["line"]],
  outputDir: "test-results-auth",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(hostResolverRules && {
      launchOptions: {
        args: [`--host-resolver-rules=${hostResolverRules}`],
      },
    }),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
