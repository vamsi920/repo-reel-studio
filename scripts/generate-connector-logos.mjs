#!/usr/bin/env node
/**
 * Generates the connector logo set as local SVG files.
 *
 * Vendor logos are never fetched at runtime: the Netlify CSP forbids it, an
 * air-gapped install could not load them, and hot-linking a vendor's asset
 * leaks the fact that this customer is evaluating them. These are neutral
 * monogram marks -- a tinted rounded square with the provider's initials --
 * which also sidesteps redistributing trademarked artwork.
 *
 * Run: node scripts/generate-connector-logos.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "src", "lib", "environment", "logos");

/** file -> [initials, accent] */
const MARKS = {
  "github.svg": ["GH", "#24292f"],
  "github-enterprise.svg": ["GE", "#1f6feb"],
  "gitlab.svg": ["GL", "#e24329"],
  "bitbucket.svg": ["BB", "#0052cc"],
  "jira.svg": ["JR", "#0052cc"],
  "linear.svg": ["LN", "#5e6ad2"],
  "gemini.svg": ["GM", "#1a73e8"],
  "openai.svg": ["OA", "#10a37f"],
  "anthropic.svg": ["AN", "#d97757"],
  "azure.svg": ["AZ", "#0078d4"],
  "bedrock.svg": ["BR", "#ff9900"],
  "ollama.svg": ["OL", "#4b5563"],
  "litellm.svg": ["LL", "#7c3aed"],
  "pgvector.svg": ["PV", "#3ecf8e"],
  "pinecone.svg": ["PC", "#1c17ff"],
  "qdrant.svg": ["QD", "#dc244c"],
  "weaviate.svg": ["WV", "#00c9a7"],
  "elasticsearch.svg": ["ES", "#f0a10d"],
  "tigergraph.svg": ["TG", "#ff6b00"],
  "supabase.svg": ["SB", "#3ecf8e"],
  "s3.svg": ["S3", "#569a31"],
  "aws.svg": ["AW", "#ff9900"],
  "postgres.svg": ["PG", "#336791"],
  "vault.svg": ["VT", "#ffd814"],
  "posthog.svg": ["PH", "#f54e00"],
  "datadog.svg": ["DD", "#632ca6"],
  "slack.svg": ["SL", "#4a154b"],
  "teams.svg": ["MT", "#5059c9"],
  "jenkins.svg": ["JK", "#d33833"],
  "okta.svg": ["OK", "#007dc1"],
  "entra.svg": ["EN", "#0078d4"],
};

function mark(initials, accent) {
  // 12% opacity plate keeps the tile legible on both light and dark surfaces
  // without a second asset; the glyph itself carries the accent at full
  // strength.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" role="img" aria-hidden="true" focusable="false">
  <rect width="40" height="40" rx="11" fill="${accent}" fill-opacity="0.14"/>
  <rect x="0.75" y="0.75" width="38.5" height="38.5" rx="10.25" fill="none" stroke="${accent}" stroke-opacity="0.34" stroke-width="1.5"/>
  <text x="20" y="21" fill="${accent}" font-family="Outfit, ui-sans-serif, system-ui, sans-serif" font-size="14" font-weight="600" letter-spacing="0.5" text-anchor="middle" dominant-baseline="central">${initials}</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
for (const [file, [initials, accent]] of Object.entries(MARKS)) {
  writeFileSync(resolve(OUT, file), mark(initials, accent));
}
process.stdout.write(`${Object.keys(MARKS).length} connector logos written to ${OUT}\n`);
