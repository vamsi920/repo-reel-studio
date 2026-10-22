#!/usr/bin/env node
// Checks that the published case-studies site is reachable on every address
// people use, and that every study in site/modules.json is live there.
// Exit code 1 (with a reason per failure) when anything is down or missing.
//
//   node case-studies/check-live.mjs
//   CASE_STUDIES_URLS="https://a,https://b" node case-studies/check-live.mjs
import { readFileSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve as resolveDns, resolveNs, resolve4, Resolver } from "node:dns/promises";

const DEFAULT_URLS = [
  "https://neodevex-case-studies.neodevex.com",
  "https://neodevex-case-studies.netlify.app",
];
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

const here = dirname(fileURLToPath(import.meta.url));
const modules = JSON.parse(
  readFileSync(resolvePath(here, "site/modules.json"), "utf8"),
);
const urls = (process.env.CASE_STUDIES_URLS || DEFAULT_URLS.join(","))
  .split(",")
  .map((u) => u.trim().replace(/\/$/, ""))
  .filter(Boolean);

async function fetchText(url) {
  let last;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      const text = await res.text();
      if (res.ok) return text;
      last = new Error(`HTTP ${res.status}`);
    } catch (error) {
      last = error;
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw last;
}

// neodevex.com was once delegated to two DNS providers at once (Netlify DNS
// and Squarespace); a record on only one of them failed for some visitors.
// Since 2026-10-22 only Netlify DNS is delegated. Asking every authoritative
// nameserver directly still catches a split if one is ever re-added.
async function checkEveryNameserver(host, failures) {
  const zone = host.split(".").slice(-2).join(".");
  let nameservers;
  try {
    nameservers = await resolveNs(zone);
  } catch (error) {
    failures.push(`${zone}: cannot list nameservers (${error.code || error.message})`);
    return;
  }
  for (const ns of nameservers) {
    try {
      const resolver = new Resolver({ timeout: 5000, tries: 2 });
      resolver.setServers(await resolve4(ns));
      // An authoritative server answers a CNAME without following it, so
      // ask for the CNAME first and fall back to A records.
      const cname = await resolver.resolveCname(host).catch(() => []);
      const answer = cname.length ? cname : await resolver.resolve4(host);
      if (!answer.length) failures.push(`${host}: no answer from ${ns}`);
    } catch (error) {
      failures.push(`${host}: nameserver ${ns} does not know it (${error.code || error.message}); add the record there too`);
    }
  }
}

const failures = [];
for (const base of urls) {
  const host = new URL(base).hostname;
  if (!host.endsWith(".netlify.app")) await checkEveryNameserver(host, failures);
  try {
    await resolveDns(host);
  } catch (error) {
    failures.push(`${host}: DNS does not resolve (${error.code || error.message})`);
    continue;
  }
  let index;
  try {
    index = await fetchText(`${base}/`);
  } catch (error) {
    failures.push(`${base}/: ${error.cause?.code || error.message}`);
    continue;
  }
  for (const study of modules) {
    if (!index.includes(`href="${study.href}"`)) {
      failures.push(`${base}/: index has no link to ${study.href} (deploy is behind the repo)`);
    }
    try {
      const page = await fetchText(`${base}/${study.href}`);
      if (!page.includes("<title>")) failures.push(`${base}/${study.href}: no <title>`);
    } catch (error) {
      failures.push(`${base}/${study.href}: ${error.cause?.code || error.message}`);
    }
  }
}

if (failures.length) {
  console.error(`Case studies site check FAILED (${failures.length}):`);
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Case studies site OK: ${urls.length} addresses, ${modules.length} studies each.`);
