import {
  test,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

/**
 * Team management, end to end, with two real accounts in two separate
 * browsers: an owner creates a team and invites a teammate by email, the
 * teammate accepts through the link, roles and visibility of controls follow,
 * a workspace is shared, restricted and granted by name, an invitation is
 * cancelled, the activity log fills, the teammate leaves and
 * the owner deletes the team. Everything the test creates it removes.
 *
 * Needs a second account next to the usual one (see tests/e2e/auth/README.md):
 *   E2E_TEAMMATE_EMAIL / E2E_TEAMMATE_PASSWORD
 * Both must be able to sign in already; the test creates no accounts.
 */

const ownerEmail = process.env.E2E_TEST_EMAIL?.trim();
const ownerPassword = process.env.E2E_TEST_PASSWORD?.trim();
const mateEmail = process.env.E2E_TEAMMATE_EMAIL?.trim();
const matePassword = process.env.E2E_TEAMMATE_PASSWORD?.trim();

test.skip(
  !ownerEmail || !ownerPassword || !mateEmail || !matePassword,
  "E2E_TEST_EMAIL / E2E_TEST_PASSWORD / E2E_TEAMMATE_EMAIL / E2E_TEAMMATE_PASSWORD not set -- see tests/e2e/auth/README.md",
);

test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const teamName = `E2E Team ${Date.now().toString(36)}`;

async function signIn(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  // The analytics-consent dialog covers the page until it is answered, and
  // its answer lives in the backend's settings, not in this browser. Present
  // the choice as already made (declined) to this browser only, so the test
  // neither clicks through the dialog nor changes anyone's saved setting.
  await context.route(/\/api\/settings(\?.*)?$/, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    const response = await route.fetch();
    let body: Record<string, unknown>;
    try {
      body = await response.json();
    } catch {
      await route.fulfill({ response });
      return;
    }
    const misc = (body.misc_settings ?? {}) as Record<string, unknown>;
    const preferences = (misc.app_preferences ?? {}) as Record<string, unknown>;
    if (preferences.user_consents_to_analytics == null) {
      preferences.user_consents_to_analytics = false;
    }
    body.misc_settings = { ...misc, app_preferences: preferences };
    await route.fulfill({ response, json: body });
  });
  const page = await context.newPage();
  page.on("request", (request) => {
    const headers = request.headers();
    if (
      /\/rest\/v1\//.test(request.url()) &&
      headers.apikey &&
      headers.authorization?.startsWith("Bearer ey")
    ) {
      supabaseCalls.set(page, {
        origin: new URL(request.url()).origin,
        apikey: headers.apikey,
        authorization: headers.authorization,
      });
    }
  });
  // A fresh browser gets the first-run and analytics dialogs, which cover
  // the page. Answer them up front (consent denied: no analytics from tests).
  await page.addInitScript(() => {
    window.localStorage.setItem("analytics-consent", "false");
    window.localStorage.setItem("openhands-telemetry-consent", "denied");
    window.localStorage.setItem("openhands-telemetry-first-use", "true");
    window.localStorage.setItem("openhands-onboarded", "1");
    window.localStorage.setItem("neo-tutorial-seen", "1");
  });
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 45_000 })
    .toMatch(/\/conversations/);
  // An account that has never taken the guided tour gets it on sign-in. It
  // plays by itself and walks the app from page to page, so close it.
  await page
    .getByTestId("tutorial-skip")
    .click({ timeout: 8_000 })
    .catch(() => {});
  return { context, page };
}

interface SupabaseCall {
  origin: string;
  apikey: string;
  authorization: string;
}

/**
 * How each page's app talks to its database, read off its own requests: the
 * project URL, the public key and the signed-in user's token. Lets a test do
 * what the app does when a folder is opened (register a workspace) without
 * driving a whole agent conversation.
 */
const supabaseCalls = new WeakMap<Page, SupabaseCall>();

async function callDatabase(page: Page, path: string, body: unknown) {
  const call = supabaseCalls.get(page);
  if (!call) throw new Error("the app has not talked to its database yet");
  return page.request.post(`${call.origin}/rest/v1/${path}`, {
    headers: {
      apikey: call.apikey,
      authorization: call.authorization,
      "content-type": "application/json",
    },
    data: body,
  });
}

/** The team page for whichever team is active, once it has loaded. */
async function openTeamPage(page: Page, tab = "") {
  await page.goto(`/team${tab ? `/${tab}` : ""}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("team-tab-members")).toBeVisible({
    timeout: 30_000,
  });
}

async function activeTeamTitle(page: Page): Promise<string> {
  return (await page.getByTestId("team-title").innerText()).trim();
}

let owner: { context: BrowserContext; page: Page };
let mate: { context: BrowserContext; page: Page };
let inviteLink = "";

test.beforeAll(async ({ browser }) => {
  owner = await signIn(browser, ownerEmail!, ownerPassword!);
  mate = await signIn(browser, mateEmail!, matePassword!);
});

test.afterAll(async () => {
  // Best-effort cleanup if a step failed half-way: delete the team if the
  // owner is still in it.
  try {
    await openTeamPage(owner.page, "settings");
    if ((await activeTeamTitle(owner.page)) === teamName) {
      await owner.page.getByTestId("delete-team-button").click();
      await owner.page.getByTestId("delete-team-confirm-input").fill(teamName);
      await owner.page.getByTestId("delete-team-confirm-confirm").click();
      await owner.page.waitForURL(/\/conversations/, { timeout: 30_000 });
    }
  } catch {
    // Nothing left to clean, or the page is gone.
  }
  await owner?.context.close();
  await mate?.context.close();
});

test("owner creates a team and the app moves into it", async () => {
  const { page } = owner;
  await page.getByTestId("user-menu-trigger").click();
  await page.getByTestId("team-create-button").click();
  await page.getByTestId("create-team-name").fill(teamName);
  await page.getByTestId("create-team-submit").click();

  // Creating switches teams, which reloads the app.
  await expect(page.getByTestId("user-menu-team-name")).toHaveText(teamName, {
    timeout: 45_000,
  });

  await openTeamPage(page);
  expect(await activeTeamTitle(page)).toBe(teamName);
  await expect(page.getByTestId("team-member-row")).toHaveCount(1);
  await expect(page.getByTestId("team-member-row")).toContainText(ownerEmail!);
});

test("owner invites the teammate and gets a link for them", async () => {
  const { page } = owner;
  await page.getByTestId("invite-members-button").click();
  // The owner's own address rides along to prove it is reported, not invited.
  await page.getByTestId("invite-emails").fill(`${mateEmail}, ${ownerEmail}`);
  await page.getByTestId("invite-role").selectOption("member");
  await page.getByTestId("invite-submit").click();

  await expect(page.getByTestId("invite-outcome-invited")).toContainText(
    mateEmail!.toLowerCase(),
  );
  await expect(page.getByTestId("invite-outcome-already_member")).toBeVisible();
  inviteLink = await page.getByTestId("invite-link").inputValue();
  expect(inviteLink).toContain("/invite/");
  await page.getByTestId("invite-done").click();

  await page.getByTestId("team-tab-invitations").click();
  await expect(page.getByTestId("team-invite-row")).toContainText(
    mateEmail!.toLowerCase(),
  );
});

test("the owner cannot use the teammate's link", async () => {
  const { page } = owner;
  await page.goto(new URL(inviteLink).pathname, {
    waitUntil: "domcontentloaded",
  });
  // The owner is already in the team, so there is nothing to accept.
  await expect(page.getByTestId("invite-already-member")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("invite-accept")).toHaveCount(0);
});

test("teammate sees the invitation in the app and accepts it through the link", async () => {
  const { page } = mate;
  // Addressed to their email, so it is waiting without the link.
  await openTeamPage(page);
  // (Filtered by team: the account may have other invitations waiting.)
  await expect(
    page.getByTestId("my-invite-row").filter({ hasText: teamName }),
  ).toBeVisible({ timeout: 30_000 });

  await page.goto(new URL(inviteLink).pathname, {
    waitUntil: "domcontentloaded",
  });
  await page.getByTestId("invite-accept").click();
  await expect(page.getByTestId("user-menu-team-name")).toHaveText(teamName, {
    timeout: 45_000,
  });

  // A member sees the team but none of the management controls.
  await openTeamPage(page);
  expect(await activeTeamTitle(page)).toBe(teamName);
  await expect(page.getByTestId("team-member-row")).toHaveCount(2);
  await expect(page.getByTestId("invite-members-button")).toHaveCount(0);
  await expect(page.getByTestId("member-role-select")).toHaveCount(0);
  await expect(page.getByTestId("remove-member-button")).toHaveCount(0);
  await page.getByTestId("team-tab-invitations").click();
  await expect(page.getByTestId("invitations-forbidden")).toBeVisible();
  await page.getByTestId("team-tab-activity").click();
  await expect(page.getByTestId("activity-forbidden")).toBeVisible();

  // The used link is spent.
  await page.goto(new URL(inviteLink).pathname, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("invite-already-member")).toBeVisible({
    timeout: 30_000,
  });
});

test("a workspace is shared with the team, hidden once restricted, and reopened by a grant", async () => {
  const workspaceName = `billing-api-${Date.now().toString(36)}`;

  // Register a workspace the way the app does when a folder is opened while
  // this team is active.
  const resolved = await callDatabase(
    owner.page,
    "rpc/resolve_active_team",
    {},
  );
  const team = (await resolved.json()) as { id: string; name: string };
  expect(team.name).toBe(teamName);
  const created = await callDatabase(owner.page, "workspaces", {
    id: `e2e_${workspaceName}`,
    org_id: team.id,
    backend_id: "e2e",
    path: `/e2e/${workspaceName}`,
    name: workspaceName,
  });
  expect(created.status()).toBe(201);

  // Team-visible: the member sees it, read-only, with nothing to delete.
  await openTeamPage(mate.page, "workspaces");
  const mateRow = mate.page
    .getByTestId("team-workspace-row")
    .filter({ hasText: workspaceName });
  await expect(mateRow).toBeVisible({ timeout: 30_000 });
  await expect(mateRow.getByTestId("workspace-delete-button")).toHaveCount(0);

  // The owner restricts it...
  await openTeamPage(owner.page, "workspaces");
  const ownerRow = owner.page
    .getByTestId("team-workspace-row")
    .filter({ hasText: workspaceName });
  await ownerRow.getByTestId("workspace-manage-button").click();
  await owner.page.getByTestId("workspace-visibility-restricted").check();
  await owner.page.getByTestId("workspace-save").click();
  await expect(owner.page.getByTestId("workspace-access-modal")).toHaveCount(
    0,
    {
      timeout: 15_000,
    },
  );

  // ...and it disappears for the member.
  await openTeamPage(mate.page, "workspaces");
  await expect(mate.page.getByTestId("workspaces-empty")).toBeVisible({
    timeout: 30_000,
  });

  // A grant by name brings it back for that one person.
  await ownerRow.getByTestId("workspace-manage-button").click();
  await owner.page
    .getByTestId("workspace-add-member")
    .selectOption({ label: mateEmail!.toLowerCase() });
  await owner.page.getByTestId("workspace-add-role").selectOption("viewer");
  await owner.page.getByTestId("workspace-add-submit").click();
  await expect(owner.page.getByTestId("workspace-member-row")).toContainText(
    mateEmail!.toLowerCase(),
    { timeout: 15_000 },
  );
  await owner.page.getByTestId("workspace-access-close").click();

  await openTeamPage(mate.page, "workspaces");
  await expect(mateRow).toBeVisible({ timeout: 30_000 });

  // Deleting needs the workspace's name typed.
  await ownerRow.getByTestId("workspace-delete-button").click();
  const confirm = owner.page.getByTestId("workspace-delete-confirm-confirm");
  await expect(confirm).toBeDisabled();
  await owner.page
    .getByTestId("workspace-delete-confirm-input")
    .fill(workspaceName);
  await confirm.click();
  await expect(ownerRow).toHaveCount(0, { timeout: 15_000 });
});

test("owner promotes the teammate, who then gets admin controls", async () => {
  await openTeamPage(owner.page);
  await expect(owner.page.getByTestId("team-member-row")).toHaveCount(2);
  await owner.page.getByTestId("member-role-select").selectOption("admin");
  await expect(owner.page.getByTestId("member-role-select")).toHaveValue(
    "admin",
    { timeout: 15_000 },
  );

  await openTeamPage(mate.page);
  await expect(mate.page.getByTestId("invite-members-button")).toBeVisible({
    timeout: 30_000,
  });
  // An admin still cannot touch the owner.
  await expect(mate.page.getByTestId("remove-member-button")).toHaveCount(0);
});

test("an invitation can be cancelled, and the activity log records it all", async () => {
  const { page } = owner;
  const ghost = `e2e-ghost-${Date.now().toString(36)}@${ownerEmail!.split("@")[1]}`;
  await openTeamPage(page, "invitations");
  await page.getByTestId("invite-members-button").click();
  await page.getByTestId("invite-emails").fill(ghost);
  await page.getByTestId("invite-submit").click();
  await expect(page.getByTestId("invite-outcome-invited")).toBeVisible();
  await page.getByTestId("invite-done").click();

  const row = page.getByTestId("team-invite-row").filter({ hasText: ghost });
  await expect(row).toBeVisible();
  await row.getByTestId("invite-revoke-button").click();
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await page.getByTestId("team-tab-activity").click();
  // created, 2 invitations, joined, role change, cancellation.
  await expect
    .poll(() => page.getByTestId("team-activity-row").count(), {
      timeout: 15_000,
    })
    .toBeGreaterThanOrEqual(6);
});

test("the only owner cannot leave; the teammate can, and lands in their personal team", async () => {
  await openTeamPage(owner.page, "settings");
  await expect(owner.page.getByTestId("leave-team-button")).toBeDisabled();

  await openTeamPage(mate.page, "settings");
  await mate.page.getByTestId("leave-team-button").click();
  await mate.page.getByTestId("leave-confirm-confirm").click();
  await mate.page.waitForURL(/\/conversations/, { timeout: 45_000 });

  await openTeamPage(mate.page);
  expect(await activeTeamTitle(mate.page)).not.toBe(teamName);
  await expect(mate.page.getByTestId("team-member-row")).toHaveCount(1);
});

test("owner deletes the team after typing its name", async () => {
  const { page } = owner;
  await openTeamPage(page, "settings");
  await page.getByTestId("delete-team-button").click();
  const confirm = page.getByTestId("delete-team-confirm-confirm");
  await expect(confirm).toBeDisabled();
  await page.getByTestId("delete-team-confirm-input").fill(teamName);
  await confirm.click();
  await page.waitForURL(/\/conversations/, { timeout: 45_000 });

  await openTeamPage(page);
  expect(await activeTeamTitle(page)).not.toBe(teamName);
  await page.getByTestId("user-menu-trigger").click();
  await expect(page.getByTestId("user-menu")).not.toContainText(teamName);
});
