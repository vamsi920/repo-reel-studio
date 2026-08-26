# Authenticated live checks

Playwright tests that log into a real, already-deployed instance of the app
(production by default) with real credentials, and verify a logged-in page
actually works.

## Why this exists

Claude (and any agent) will not type a password into a login form, log in,
or otherwise authenticate as you, even with an explicit "it's a test account,
go ahead." That's a fixed boundary, not a preference. It also can't be your
eyes on a page it isn't allowed to log into.

What it *can* do is write and run a test that logs in -- the test framework
owns the credential and drives the login, not the agent. This suite is that:
the standing way to verify "does the logged-in app actually work" without an
agent (or you, repeatedly) doing it by hand.

## Setup

1. Create a dedicated test account (not your own login) -- see
   `vamsi.devadula@neodevex.com` for the one already in use here.
2. Add to `.env.test.local` (already gitignored, never commit it):
   ```
   E2E_BASE_URL=https://neo.neodevex.com   # or a staging URL
   E2E_TEST_EMAIL=<test account email>
   E2E_TEST_PASSWORD=<test account password>
   ```
3. Run:
   ```bash
   node --env-file-if-exists=.env.test.local -- npx playwright test --config=playwright.auth.config.ts
   ```
   or `npm run test:e2e:auth` (reads the same file).

In CI, set the same three values as repo/environment secrets instead of a
committed file -- the test only ever reads them from `process.env`.

## Adding a new check

Add a `.spec.ts` file here. Reuse the login flow at the top of
`login-and-automations.spec.ts` rather than duplicating it if a test needs
to start from a logged-in state.

## Rotating the test account's password

The test account's password lives in `.env.test.local` (local) or your CI
secret store -- update it there after a rotation. It is never expected to
appear in a chat transcript; if it ever does, rotate it.
