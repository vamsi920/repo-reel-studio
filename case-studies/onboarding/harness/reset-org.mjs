#!/usr/bin/env node
/**
 * Resets what one study scenario leaves on the test org, so the next
 * simulated company does not inherit it: the org's company profile (facts and
 * runtime checks) and the connections the study creates. Pre-existing
 * connections on the org (GitHub, Jira Cloud) are left alone.
 *
 *   node case-studies/onboarding/harness/reset-org.mjs <org-id>
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env; prints only
 * row counts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STUDY_PROVIDERS = [
  "gitlab-self-managed",
  "jira-dc",
  "linear",
  "vercel",
  "openai",
  "azure-openai",
  "aws-bedrock",
];

const env = Object.fromEntries(
  readFileSync(resolve(new URL("../../..", import.meta.url).pathname, ".env"), "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const orgId = process.argv[2];
if (!url || !key || !/^[0-9a-f-]{36}$/.test(orgId ?? "")) {
  console.error("usage: reset-org.mjs <org-id> (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env)");
  process.exit(2);
}

async function del(table, filter) {
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      prefer: "return=representation",
    },
  });
  if (!res.ok) throw new Error(`${table} -> ${res.status}`);
  const rows = await res.json();
  console.log(`${table}: deleted ${rows.length}`);
}

await del("company_profiles", `org_id=eq.${orgId}`);
await del(
  "connections",
  `org_id=eq.${orgId}&provider_id=in.(${STUDY_PROVIDERS.join(",")})`,
);
