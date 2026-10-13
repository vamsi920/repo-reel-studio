#!/usr/bin/env node
/**
 * GitHub event bridge for local NeoDevEx installs.
 *
 * The automation backend understands GitHub events (issues, issue comments,
 * pull requests, PR reviews, pushes, releases) at
 * `POST /v1/events/{org}/github`, signed with AUTOMATION_WEBHOOK_SECRET. A
 * local install has no public URL, so GitHub can never deliver a webhook to
 * it, and every GitHub-triggered automation silently never ran. Benchmarked
 * against Devin (case-studies/automations), that was the largest automation
 * gap: Devin starts runs from 7 GitHub event types.
 *
 * This bridge polls GitHub for the repositories that enabled
 * GitHub-triggered automations actually watch, turns new activity into
 * webhook-shaped payloads, signs them and posts them to the backend. Failed
 * CI runs (which the backend has no built-in GitHub schema for) go to a
 * custom webhook source, `github-ci`, with event keys like
 * `workflow_run.failure`.
 *
 * Each tick also adds the delivery contract to automations created outside
 * the app's forms, runs automation-run-recovery.mjs, which resumes runs
 * that died on a transient LLM error (429 / quota / overloaded), and
 * automation-guard.mjs, which enforces spend caps, rate limits and overlap
 * policies and sends failure alerts.
 *
 * Dependency-free (node: builtins only) so it ships in the Docker image and
 * the desktop app unchanged. It never throws out of the loop: a GitHub or
 * backend error is logged and retried on the next tick.
 *
 * Env:
 *   AUTOMATION_URL            automation backend base, e.g. http://127.0.0.1:18001
 *   AGENT_SERVER_URL          agent-server base, e.g. http://127.0.0.1:18000
 *   SESSION_API_KEY           key for both (X-Session-API-Key)
 *   AUTOMATION_WEBHOOK_SECRET secret the backend verifies github events with
 *   GITHUB_TOKEN              optional; otherwise read from the agent-server
 *                             secret store (the app keeps it there)
 *   GITHUB_BRIDGE_STATE       state file (cursors, custom webhook secret)
 *   NEODEVEX_APP_URL          optional; app origin used for links in alerts
 *   GITHUB_BRIDGE_INTERVAL_MS poll interval, default 10000 (GitHub GETs are
 *                             conditional, so unchanged polls are free)
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { withDeliveryContract } from "./automation-delivery-contract.mjs";
import {
  CI_SOURCE,
  repoSlug,
  scopeTriggerToRepo,
} from "./automation-event-trigger.mjs";
import { createAutomationGuard } from "./automation-guard.mjs";
import { createRunRecovery } from "./automation-run-recovery.mjs";

export { CI_SOURCE, repoSlug };
const GITHUB_API = "https://api.github.com";
const MAX_SEEN = 500;

/**
 * How far back each poll looks for items it has not sent yet. GitHub serves
 * list endpoints from a cache for up to 60 s, so an item can first appear in
 * a poll that runs after the cursor already passed its timestamp; a cursor
 * that only moved forward then skipped it for good (an issue opened right
 * after a cached poll never triggered). The `seen` ids prevent repeats.
 */
export const LOOKBACK_MS = 10 * 60 * 1000;

function ghCliToken() {
  const out = spawnSync("gh", ["auth", "token"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return out.status === 0 ? out.stdout.trim() || null : null;
}

export function sign(body, secret) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Repos watched by enabled GitHub-triggered automations, with their org ids. */
export function watchedRepos(automations) {
  const out = new Map();
  for (const a of automations) {
    const t = a.trigger ?? {};
    if (!a.enabled || t.type !== "event") continue;
    if (t.source !== "github" && t.source !== CI_SOURCE) continue;
    const repos =
      a.preset_metadata?.repos ?? (a.repository ? [{ url: a.repository }] : []);
    for (const r of repos) {
      const slug = repoSlug(r.url);
      if (slug && a.org_id) out.set(slug, a.org_id);
    }
  }
  return out;
}

/**
 * New items since the cursor, oldest first, skipping ids already sent.
 * @template {{ id: string | number } & Record<string, any>} T
 * @param {T[]} items
 * @param {string} sinceIso
 * @param {Set<string>} seen
 * @param {string} [timeField]
 * @returns {T[]}
 */
export function freshItems(items, sinceIso, seen, timeField = "created_at") {
  const since = Date.parse(sinceIso);
  return items
    .filter((i) => Date.parse(i[timeField]) > since && !seen.has(String(i.id)))
    .sort((a, b) => Date.parse(a[timeField]) - Date.parse(b[timeField]));
}

export function issueOpenedPayload(issue, repository) {
  return { action: "opened", issue, repository, sender: issue.user };
}
export function issueCommentPayload(comment, issue, repository) {
  return {
    action: "created",
    comment,
    issue,
    repository,
    sender: comment.user,
  };
}
export function pullRequestOpenedPayload(pr, repository) {
  return {
    action: "opened",
    number: pr.number,
    pull_request: pr,
    repository,
    sender: pr.user,
  };
}
export function pushPayload(branch, before, after, commits, repository) {
  const shaped = commits.map((c) => ({
    id: c.sha,
    message: c.commit?.message ?? "",
    timestamp: c.commit?.author?.date,
    url: c.html_url,
    author: {
      name: c.commit?.author?.name,
      email: c.commit?.author?.email,
      username: c.author?.login,
    },
  }));
  const sender = commits.at(-1)?.author ?? repository.owner;
  return {
    ref: `refs/heads/${branch}`,
    before,
    after,
    commits: shaped,
    head_commit: shaped.at(-1) ?? null,
    repository,
    pusher: { name: sender?.login },
    sender,
  };
}
export function ciFailurePayload(run, repository) {
  return {
    event: `workflow_run.${run.conclusion}`,
    workflow_run: run,
    pull_requests: run.pull_requests ?? [],
    repository,
    sender: run.actor ?? run.triggering_actor,
  };
}

function loadState(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { repos: {} };
  }
}

function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1));
  renameSync(tmp, path);
}

/** @typedef {{ log: (message: string) => void, error: (message: string) => void }} Logger */

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 * @param {Logger} [log]
 */
export function createBridge(
  env = process.env,
  fetchImpl = fetch,
  log = console,
) {
  const automationUrl = (
    env.AUTOMATION_URL ?? "http://127.0.0.1:18001"
  ).replace(/\/$/, "");
  const agentUrl = (env.AGENT_SERVER_URL ?? "http://127.0.0.1:18000").replace(
    /\/$/,
    "",
  );
  const key = env.SESSION_API_KEY ?? "";
  const secret = env.AUTOMATION_WEBHOOK_SECRET ?? "";
  const statePath =
    env.GITHUB_BRIDGE_STATE ??
    `${env.HOME}/.openhands/agent-canvas/github-bridge-state.json`;
  const state = loadState(statePath);

  /**
   * Conditional GitHub GET: GitHub answers 304 when nothing changed, and 304s
   * do not count against the API rate limit, so polling every few seconds
   * costs almost nothing. URLs must be stable between ticks for this to work
   * (no changing query parameters); new items are picked by `freshItems`.
   * @type {Map<string, { etag: string, body: any }>}
   */
  const etags = new Map();

  async function githubGet(url, token) {
    const cached = etags.get(url);
    let res;
    try {
      res = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          ...(cached ? { "If-None-Match": cached.etag } : {}),
        },
      });
    } catch (error) {
      throw new Error(
        `GET ${url.split("?")[0]} unreachable (${error.message})`,
      );
    }
    if (res.status === 304 && cached) return cached.body;
    const text = await res.text();
    if (!res.ok)
      throw new Error(
        `GET ${url.split("?")[0]} -> ${res.status} ${text.slice(0, 200)}`,
      );
    const body = text ? JSON.parse(text) : null;
    const etag = res.headers?.get?.("etag");
    if (etag) {
      if (etags.size > 500) etags.delete(etags.keys().next().value);
      etags.set(url, { etag, body });
    }
    return body;
  }

  async function json(url, init = {}) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (error) {
      throw new Error(
        `${init.method ?? "GET"} ${url.split("?")[0]} unreachable (${error.message})`,
      );
    }
    const text = await res.text();
    if (!res.ok)
      throw new Error(
        `${init.method ?? "GET"} ${url.split("?")[0]} -> ${res.status} ${text.slice(0, 200)}`,
      );
    return text ? JSON.parse(text) : null;
  }

  let cachedToken = null;

  async function storedToken() {
    const res = await fetchImpl(
      `${agentUrl}/api/settings/secrets/GITHUB_TOKEN`,
      {
        headers: { "X-Session-API-Key": key },
      },
    );
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? parsed : (parsed?.value ?? null);
    } catch {
      return text || null;
    }
  }

  async function isValid(token) {
    const res = await fetchImpl(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    return res.ok;
  }

  /**
   * First token GitHub accepts, from: GITHUB_TOKEN env, the app's stored
   * credential, then this machine's GitHub CLI login. The stored credential
   * is minted while a browser session is open and expires afterwards
   * (benchmarked: it was already rejected with 401 when a scheduled run
   * needed it), so a dead token is skipped instead of failing every poll.
   */
  async function githubToken() {
    if (cachedToken) return cachedToken;
    const candidates = [
      ["env", async () => env.GITHUB_TOKEN ?? null],
      ["app connection", storedToken],
      ["gh CLI", async () => ghCliToken()],
    ];
    for (const [label, read] of candidates) {
      const token = await read().catch(() => null);
      if (token && (await isValid(token).catch(() => false))) {
        if (label !== "env")
          log.log(`[github-bridge] using GitHub credentials from ${label}`);
        cachedToken = token;
        return token;
      }
      if (token)
        log.error(
          `[github-bridge] GitHub rejected the credential from ${label}; trying the next one`,
        );
    }
    return null;
  }

  async function listAutomations() {
    const all = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const page = await json(
        `${automationUrl}/api/automation/v1?limit=100&offset=${offset}`,
        {
          headers: { "X-Session-API-Key": key },
        },
      );
      const items = page?.automations ?? page?.items ?? [];
      all.push(...items);
      if (items.length < 100) break;
    }
    return all;
  }

  async function ciWebhookSecret() {
    if (state.ciWebhookSecret) return state.ciWebhookSecret;
    const created = await json(`${automationUrl}/api/automation/v1/webhooks`, {
      method: "POST",
      headers: { "X-Session-API-Key": key, "content-type": "application/json" },
      body: JSON.stringify({
        name: "GitHub CI (local bridge)",
        source: CI_SOURCE,
        event_key_expr: "event",
      }),
    });
    state.ciWebhookSecret = created.webhook_secret;
    state.ciSignatureHeader = created.signature_header ?? "X-Hub-Signature-256";
    saveState(statePath, state);
    return state.ciWebhookSecret;
  }

  async function post(
    orgId,
    source,
    payload,
    sourceSecret,
    header = "X-Hub-Signature-256",
  ) {
    const body = JSON.stringify(source === "github" ? { payload } : payload);
    const res = await fetchImpl(
      `${automationUrl}/api/automation/v1/events/${orgId}/${source}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [header]: sign(body, sourceSecret),
        },
        body,
      },
    );
    const text = await res.text();
    if (!res.ok)
      throw new Error(`event ${source} -> ${res.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : {};
  }

  function remember(repoState, id) {
    repoState.seen.push(String(id));
    if (repoState.seen.length > MAX_SEEN)
      repoState.seen.splice(0, repoState.seen.length - MAX_SEEN);
  }

  async function pollRepo(slug, orgId, token, nowIso) {
    const gh = (path) => githubGet(`${GITHUB_API}/repos/${slug}${path}`, token);
    const isNewRepo = !state.repos[slug];
    const repoState = (state.repos[slug] ??= {
      since: nowIso,
      seen: [],
      head: null,
    });
    const seen = new Set(repoState.seen);
    const repository = await gh("");
    // A repo seen for the first time starts at "now", so old activity never
    // fires; after that each poll re-reads a window for late arrivals.
    const since = isNewRepo
      ? repoState.since
      : new Date(Date.parse(repoState.since) - LOOKBACK_MS).toISOString();
    const sent = [];

    const issues = await gh(
      `/issues?state=all&sort=created&direction=desc&per_page=50`,
    );
    for (const issue of freshItems(
      issues.filter((i) => !i.pull_request),
      since,
      seen,
    )) {
      sent.push([
        "github",
        issueOpenedPayload(issue, repository),
        `issue#${issue.number}`,
      ]);
      remember(repoState, issue.id);
    }
    const comments = await gh(
      `/issues/comments?sort=created&direction=desc&per_page=50`,
    );
    for (const comment of freshItems(comments, since, seen)) {
      const issue = await githubGet(comment.issue_url, token);
      sent.push([
        "github",
        issueCommentPayload(comment, issue, repository),
        `comment#${comment.id}`,
      ]);
      remember(repoState, comment.id);
    }
    const pulls = await gh(
      `/pulls?state=all&sort=created&direction=desc&per_page=20`,
    );
    for (const pr of freshItems(pulls, since, seen)) {
      sent.push([
        "github",
        pullRequestOpenedPayload(pr, repository),
        `pr#${pr.number}`,
      ]);
      remember(repoState, pr.id);
    }
    const branch = repository.default_branch;
    const head = (await gh(`/branches/${branch}`)).commit.sha;
    if (repoState.head && head !== repoState.head) {
      const cmp = await gh(`/compare/${repoState.head}...${head}`);
      sent.push([
        "github",
        pushPayload(
          branch,
          repoState.head,
          head,
          cmp.commits ?? [],
          repository,
        ),
        `push ${head.slice(0, 7)}`,
      ]);
    }
    repoState.head = head;
    const runs = await gh(`/actions/runs?status=completed&per_page=20`);
    const failed = (runs.workflow_runs ?? []).filter((r) =>
      ["failure", "timed_out"].includes(r.conclusion),
    );
    for (const run of freshItems(failed, since, seen, "updated_at")) {
      sent.push([
        CI_SOURCE,
        ciFailurePayload(run, repository),
        `ci-run#${run.id}`,
      ]);
      remember(repoState, run.id);
    }

    for (const [source, payload, label] of sent) {
      try {
        const result =
          source === "github"
            ? await post(orgId, source, payload, secret)
            : await post(
                orgId,
                source,
                payload,
                await ciWebhookSecret(),
                state.ciSignatureHeader,
              );
        log.log(
          `[github-bridge] ${slug} ${label} -> matched ${result.matched ?? result.automations_triggered ?? "?"}`,
        );
      } catch (error) {
        log.error(`[github-bridge] ${slug} ${label} failed: ${error.message}`);
      }
    }
    repoState.since = nowIso;
  }

  // Runs on every tick, GitHub triggers or not: scheduled and webhook runs
  // fail on transient LLM errors too.
  const recovery = createRunRecovery({
    automationUrl,
    agentUrl,
    key,
    state,
    save: () => saveState(statePath, state),
    fetchImpl,
    log,
  });

  // Spend caps, rate limits, overlap control and failure alerts; runs after
  // recovery so a failure that is being retried is not alerted yet.
  const guard = createAutomationGuard({
    automationUrl,
    agentUrl,
    key,
    appUrl: (env.NEODEVEX_APP_URL ?? "").replace(/\/$/, ""),
    state,
    save: () => saveState(statePath, state),
    fetchImpl,
    log,
  });

  /**
   * Give every prompt automation the current delivery contract. The app's
   * forms add it on save, but an automation created any other way -- by the
   * chat agent through the automation API, by curl, or by an older app
   * version -- would otherwise run without it: no RESULT line, so the app
   * cannot tell a delivered run from one that only claimed success.
   */
  async function backfillDeliveryContract() {
    try {
      for (const a of await listAutomations()) {
        /** @type {Record<string, unknown>} */
        const patch = {};
        if (typeof a.prompt === "string" && a.prompt.trim()) {
          const prompt = withDeliveryContract(a.prompt);
          if (prompt !== a.prompt) patch.prompt = prompt;
        }
        // The service matches GitHub events by type and filter only, so an
        // unscoped trigger fires for every watched repository.
        const trigger = scopeTriggerToRepo(a);
        if (trigger) patch.trigger = trigger;
        if (Object.keys(patch).length === 0) continue;
        await json(`${automationUrl}/api/automation/v1/${a.id}`, {
          method: "PATCH",
          headers: {
            "X-Session-API-Key": key,
            "content-type": "application/json",
          },
          body: JSON.stringify(patch),
        });
        log.log(
          `[github-bridge] updated automation "${a.name}": ${Object.keys(patch)
            .map((k) =>
              k === "prompt"
                ? "delivery contract"
                : "scoped trigger to its repository",
            )
            .join(", ")}`,
        );
      }
    } catch (error) {
      log.error(`[github-bridge] automation backfill: ${error.message}`);
    }
  }

  async function tick() {
    await backfillDeliveryContract();
    await recovery.tick();
    await guard.tick();
    if (!secret) {
      log.error(
        "[github-bridge] AUTOMATION_WEBHOOK_SECRET is not set; GitHub triggers are off.",
      );
      return;
    }
    const nowIso = new Date().toISOString();
    try {
      const repos = watchedRepos(await listAutomations());
      if (repos.size === 0) return;
      const token = await githubToken();
      if (!token) {
        log.error(
          "[github-bridge] no GitHub token; connect GitHub in Settings to enable GitHub triggers.",
        );
        return;
      }
      for (const [slug, orgId] of repos) {
        try {
          await pollRepo(slug, orgId, token, nowIso);
        } catch (error) {
          if (/-> 401\b/.test(error.message)) cachedToken = null;
          log.error(`[github-bridge] ${slug}: ${error.message}`);
        }
      }
      saveState(statePath, state);
    } catch (error) {
      log.error(`[github-bridge] ${error.message}`);
    }
  }

  return { tick, state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const bridge = createBridge();
  const interval = Number(process.env.GITHUB_BRIDGE_INTERVAL_MS ?? 10000);
  console.log(`[github-bridge] polling every ${interval / 1000}s`);
  const loop = async () => {
    await bridge.tick();
    setTimeout(loop, interval);
  };
  loop();
}
