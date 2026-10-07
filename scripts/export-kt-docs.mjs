#!/usr/bin/env node
/**
 * Writes a repository's latest KT (knowledge transfer) docs from Supabase into
 * a committed folder (default `docs/kt/`), so agents that start from a fresh
 * clone -- the Neo cloud routines, any external coding agent -- can read them.
 * The in-app export writes to the git-excluded `.neodevex/kt/` instead, which
 * a clone never has.
 *
 *   npm run kt:export
 *   npm run kt:export -- --owner acme --repo shop --branch main --out docs/kt
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from `.env` by the
 * npm script). Defaults owner/repo to this checkout's `origin` remote and the
 * branch to `main`. Formatting is shared with the app through
 * `src/lib/knowledge/kt-format.ts`, imported directly (Node strips its types).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
// Node resolves no extensionless TS paths; it needs the real `.ts` file name.
/* eslint-disable import-x/extensions */
import {
  buildKtFiles,
  KT_COMMITTED_DIR,
} from "../src/lib/knowledge/kt-format.ts";
/* eslint-enable import-x/extensions */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    args[key.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

/** `owner/repo` from a GitHub remote URL (https or ssh), or null. */
export function parseRemote(url) {
  const match = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? { owner: match[1], repo: match[2] } : null;
}

/** Newest generation across every `repositories` row for the repo/branch. */
export function pickLatestGeneration(generations) {
  return (
    [...generations].sort((a, b) =>
      String(b.generated_at).localeCompare(String(a.generated_at)),
    )[0] ?? null
  );
}

/** Mirrors `reconstruct()` in src/lib/data-platform/repositories/knowledge-repository.ts. */
export function rowsToKnowledge(
  generation,
  sectionRows,
  pageRows,
  diagramRows,
) {
  const diagramsByPage = new Map();
  for (const row of diagramRows) {
    if (!row.page_id) continue;
    const list = diagramsByPage.get(row.page_id) ?? [];
    list.push({ id: row.id, type: row.type, mermaid: row.mermaid ?? "" });
    diagramsByPage.set(row.page_id, list);
  }
  return {
    repositoryId: generation.repository_id,
    commitSha: generation.commit_sha,
    title: generation.title ?? "",
    summary: generation.summary ?? "",
    generatedAt: generation.generated_at,
    sections: sectionRows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      description: row.description ?? undefined,
      pageIds: row.page_ids ?? [],
    })),
    pages: pageRows.map((row) => ({
      id: row.id,
      title: row.title ?? "",
      description: row.description ?? "",
      contentMarkdown: row.content_markdown ?? "",
      importance: row.importance ?? "medium",
      relevantFiles: row.relevant_files ?? [],
      diagrams: diagramsByPage.get(row.id) ?? [],
      relatedPageIds: row.related_page_ids ?? [],
      parentSectionId: row.parent_section_id ?? undefined,
    })),
  };
}

function check(result, what) {
  if (result.error) {
    throw new Error(`${what} failed: ${result.error.message}`);
  }
  return result.data ?? [];
}

export async function fetchLatestKnowledge(client, { owner, repo, branch }) {
  const repositories = check(
    await client
      .from("repositories")
      .select("id")
      .eq("owner", owner)
      .eq("name", repo),
    "repositories lookup",
  );
  if (repositories.length === 0) return null;

  const generations = check(
    await client
      .from("knowledge_generations")
      .select(
        "id, repository_id, commit_sha, title, summary, generated_at, branch",
      )
      .in(
        "repository_id",
        repositories.map((row) => row.id),
      )
      .eq("branch", branch),
    "knowledge_generations lookup",
  );
  const generation = pickLatestGeneration(generations);
  if (!generation) return null;

  const [sections, pages, diagrams] = await Promise.all([
    client
      .from("knowledge_sections")
      .select("id, title, description, page_ids")
      .eq("generation_id", generation.id)
      .order("position", { ascending: true }),
    client
      .from("knowledge_pages")
      .select(
        "id, title, description, content_markdown, importance, relevant_files, related_page_ids, parent_section_id",
      )
      .eq("generation_id", generation.id)
      .order("position", { ascending: true }),
    client
      .from("knowledge_diagrams")
      .select("id, page_id, type, mermaid")
      .eq("page_generation_id", generation.id),
  ]);
  const pageRows = check(pages, "knowledge_pages lookup");
  if (pageRows.length === 0) return null;
  return rowsToKnowledge(
    generation,
    check(sections, "knowledge_sections lookup"),
    pageRows,
    check(diagrams, "knowledge_diagrams lookup"),
  );
}

function defaultRemote() {
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return parseRemote(url);
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const remote = defaultRemote();
  const owner = args.owner ?? remote?.owner;
  const repo = args.repo ?? remote?.repo;
  const branch = args.branch ?? "main";
  const out = args.out ?? KT_COMMITTED_DIR;
  if (!owner || !repo) {
    throw new Error(
      "Pass --owner and --repo (no origin remote to infer them).",
    );
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const knowledge = await fetchLatestKnowledge(client, { owner, repo, branch });
  if (!knowledge) {
    throw new Error(
      `No KT generation found for ${owner}/${repo}@${branch}. Generate KT for it in the app (/kt) first.`,
    );
  }

  const files = buildKtFiles(
    knowledge,
    {
      repositoryId: `${owner}/${repo}@${branch}`,
      owner,
      repo,
      branch,
      commitSha: knowledge.commitSha,
      localPath: "",
    },
    { rootDir: out },
  );
  // Only clear old pages once a complete generation is in hand, so a failed
  // run never leaves a half-written folder behind.
  rmSync(resolve(REPO_ROOT, out, "pages"), { recursive: true, force: true });
  for (const file of files) {
    const target = resolve(REPO_ROOT, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content);
  }
  console.log(
    `[kt:export] wrote ${files.length} files for ${owner}/${repo}@${branch} (commit ${knowledge.commitSha.slice(0, 8)}) to ${out}/`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(`[kt:export] ${error.message}`);
    process.exit(1);
  });
}
