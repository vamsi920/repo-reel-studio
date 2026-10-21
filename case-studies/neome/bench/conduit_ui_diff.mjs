// Black-box UI differential check: legacy AngularJS Conduit vs migrated SPA.
// Usage: node conduit_ui_diff.mjs <legacy_url> <new_url>
// Each frontend must talk to its own freshly migrated (empty) Conduit API.
// The same user journey is driven through both with role/placeholder/text
// locators only, and at every checkpoint the route (location.hash or path)
// and the visible page text are compared after normalising random slugs.
import { createRequire } from "node:module";

const require = createRequire(
  "../../../package.json",
);
const { chromium } = require("playwright");

const SLUG = /([a-z0-9]+(?:-[a-z0-9]+)*)-[a-z0-9]{6}\b/g;

function normText(t) {
  return t
    .replace(SLUG, "$1-<rand>")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" | ");
}

async function journey(base) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  // Third-party CSS/fonts are irrelevant to behaviour and may be offline.
  await page.route(/productionready\.io|googleapis|ionicframework/, (r) =>
    r.abort(),
  );
  const shots = [];
  const settle = async () => {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(400);
  };
  const snap = async (name) => {
    await settle();
    const url = new URL(page.url());
    const route = (url.hash || url.pathname).replace(SLUG, "$1-<rand>");
    const text = normText(await page.locator("body").innerText());
    shots.push({ name, route, text });
  };
  const step = async (name, fn) => {
    try {
      await fn();
      await snap(name);
    } catch (e) {
      shots.push({ name, route: "<error>", text: String(e.message).split("\n")[0] });
    }
  };
  const fill = (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(v);
  const click = (text) =>
    page.getByRole("button", { name: text }).or(page.getByRole("link", { name: text })).first().click();

  await page.goto(base);
  await snap("home anon");
  await step("open sign up", () => click("Sign up"));
  await step("sign up taken/invalid", async () => {
    await fill("Username", "alice");
    await fill("Email", "alice@example.com");
    await fill("Password", "short");
    await page.getByRole("button", { name: "Sign up" }).click();
  });
  await step("sign up ok", async () => {
    await fill("Password", "password123");
    await page.getByRole("button", { name: "Sign up" }).click();
  });
  await step("new article page", () => click("New Article"));
  await step("publish article", async () => {
    await fill("Article Title", "How to train your dragon");
    await fill("What's this article about?", "Ever wonder how?");
    await fill("Write your article (in markdown)", "# Big\n\nYou have to **believe**");
    const tags = page.getByPlaceholder("Enter tags");
    await tags.fill("dragons");
    await tags.press("Enter");
    await tags.fill("training");
    await tags.press("Enter");
    await page.getByRole("button", { name: "Publish Article" }).click();
  });
  await step("post comment", async () => {
    await fill("Write a comment...", "First!");
    await page.getByRole("button", { name: "Post Comment" }).click();
  });
  await step("own profile", () => page.getByRole("link", { name: "alice" }).first().click());
  await step("favorited tab", () => click("Favorited Articles"));
  await step("settings", () => click("Settings"));
  await step("update settings", async () => {
    await fill("Short bio about you", "I like dragons");
    await page.getByRole("button", { name: "Update Settings" }).click();
  });
  await step("back to settings", () => click("Settings"));
  await step("logout", () => click("Or click here to logout."));
  await step("sign in page", () => click("Sign in"));
  await step("sign in wrong", async () => {
    await fill("Email", "alice@example.com");
    await fill("Password", "wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
  });
  await step("sign up bob", async () => {
    await click("Sign up");
    await settle();
    await fill("Username", "bob");
    await fill("Email", "bob@example.com");
    await fill("Password", "password123");
    await page.getByRole("button", { name: "Sign up" }).click();
  });
  await step("global feed", () => click("Global Feed"));
  await step("tag filter", () => page.getByText("dragons", { exact: true }).first().click());
  await step("open article", () => page.getByText("How to train your dragon").first().click());
  await step("follow author", () => page.getByRole("button", { name: /Follow alice/ }).first().click());
  await step("favorite article", () => page.getByRole("button", { name: /Favorite Article/ }).first().click());
  await step("your feed", async () => {
    await click("Home");
    await settle();
    await click("Your Feed");
  });
  await step("bob favorites", async () => {
    await page.getByRole("link", { name: "bob" }).first().click();
    await settle();
    await click("Favorited Articles");
  });
  await step("alice profile as bob", () => page.getByRole("link", { name: "alice" }).first().click());
  await step("unfollow", () => page.getByRole("button", { name: /Unfollow alice/ }).first().click());
  await step("logout bob", async () => {
    await click("Settings");
    await settle();
    await click("Or click here to logout.");
  });
  await step("sign in alice", async () => {
    await click("Sign in");
    await settle();
    await fill("Email", "alice@example.com");
    await fill("Password", "password123");
    await page.getByRole("button", { name: "Sign in" }).click();
  });
  await step("open own article", async () => {
    await click("Global Feed");
    await settle();
    await page.getByText("How to train your dragon").first().click();
  });
  await step("edit article", () => click("Edit Article"));
  await step("save edit", async () => {
    await fill("Article Title", "How to train your dragon 2");
    await page.getByRole("button", { name: "Publish Article" }).click();
  });
  await step("delete article", () => click("Delete Article"));
  await step("unknown route", () => page.goto(new URL("#/nowhere", base).href));
  await browser.close();
  return shots;
}

const [legacy, next] = process.argv.slice(2);
const a = await journey(legacy);
const b = await journey(next);
let bad = 0;
for (let i = 0; i < a.length; i += 1) {
  const x = a[i];
  const y = b[i] ?? { route: "<missing>", text: "" };
  const same = x.route !== "<error>" && x.route === y.route && x.text === y.text;
  if (!same) bad += 1;
  console.log(`${same ? "OK  " : "DIFF"} ${x.name}`);
  if (!same) {
    if (x.route !== y.route) console.log(`     route ${x.route} != ${y.route}`);
    if (x.text !== y.text) {
      console.log(`     old: ${x.text.slice(0, 500)}`);
      console.log(`     new: ${y.text.slice(0, 500)}`);
    }
  }
}
console.log(`\n${a.length - bad} / ${a.length} checkpoints identical`);

if (process.env.SHOW) for (const s of a) console.log(`-- ${s.name} [${s.route}] ${s.text.slice(0, 220)}`);
process.exit(bad ? 1 : 0);
