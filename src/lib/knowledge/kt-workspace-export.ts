/**
 * Materializes generated KT (Knowledge) docs into the workspace itself, under
 * `.neodevex/kt/`, so every agent that works on the repo -- NeoDevEx chat,
 * Proactive, automations, and any external coding agent -- can read them as
 * plain files. Supabase and the in-memory store are invisible to an agent;
 * files in its working directory are not.
 *
 * `.neodevex/` is added to `.git/info/exclude` (never the user's
 * `.gitignore`) so the docs never leak into a user's commits or PRs.
 *
 * SECURITY: page content is LLM-generated and can contain anything,
 * including shell metacharacters. Payloads are base64-encoded and decoded
 * inside the sandbox; content is never interpolated into a command. Same
 * contract as `src/api/workspace-memory/workspace-memory-file.api.ts`.
 */
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import type {
  KnowledgeRepository,
  RepositorySnapshot,
} from "./knowledge-engine";

import {
  buildKtFiles,
  KT_META_FILE,
  KT_PAGES_DIR,
  type KtFile,
} from "./kt-format";

export {
  buildKtFiles,
  KT_DIR,
  KT_INDEX_FILE,
  KT_META_FILE,
  KT_PAGES_DIR,
  ktPageFileName,
  ktPagePath,
  ktUsageGuidance,
} from "./kt-format";
export type { KtFile } from "./kt-format";

const GIT_EXCLUDE_ENTRY = ".neodevex/";

/** Keeps each command well under ARG_MAX for very long pages. */
const MAX_CHUNK_B64_CHARS = 60_000;

export interface KtRuntimeContext {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string;
}

function encodePayload(text: string): string {
  if (typeof btoa === "function") {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  return Buffer.from(text, "utf-8").toString("base64");
}

/**
 * Commands that write one file. Paths are built only from the KT constants
 * and `ktPageFileName`'s sanitized output, so they are safe to inline;
 * content only ever appears base64-encoded. Chunks are split on 4-char
 * boundaries so each decodes independently.
 */
export function buildWriteFileCommands(file: KtFile): string[] {
  const encoded = encodePayload(file.content);
  const chunkSize = MAX_CHUNK_B64_CHARS - (MAX_CHUNK_B64_CHARS % 4);
  if (encoded.length === 0) return [`: > ${file.path}`];
  const commands: string[] = [];
  for (let offset = 0; offset < encoded.length; offset += chunkSize) {
    const chunk = encoded.slice(offset, offset + chunkSize);
    const redirect = offset === 0 ? ">" : ">>";
    commands.push(
      `printf '%s' '${chunk}' | base64 -d ${redirect} ${file.path}`,
    );
  }
  return commands;
}

/**
 * Clears stale pages from an older generation and keeps `.neodevex/` out of
 * git. Refuses (non-zero exit) until the folder is a git checkout: a repo
 * conversation clones into its working dir during the agent's first turn,
 * and `git clone .` fails on a non-empty folder, so writing first would
 * break the clone.
 */
export function buildPrepareCommand(): string {
  return [
    "test -e .git",
    `mkdir -p ${KT_PAGES_DIR}`,
    `rm -f ${KT_PAGES_DIR}/*.md`,
    `if [ -d .git/info ]; then grep -qxF '${GIT_EXCLUDE_ENTRY}' .git/info/exclude 2>/dev/null || echo '${GIT_EXCLUDE_ENTRY}' >> .git/info/exclude; fi`,
  ].join(" && ");
}

export async function exportKtToWorkspace(
  context: KtRuntimeContext,
  knowledge: KnowledgeRepository,
  snapshot: RepositorySnapshot,
): Promise<{ ok: boolean; error?: string }> {
  if (!context.conversationUrl || !context.workingDir) {
    return { ok: false, error: "no live runtime" };
  }
  const commands = [
    buildPrepareCommand(),
    ...buildKtFiles(knowledge, snapshot).flatMap(buildWriteFileCommands),
  ];
  try {
    for (const command of commands) {
      // Sequential on purpose: chunked writes to one file must stay ordered.

      const result = await AgentServerRuntimeService.executeCommand(
        context.conversationUrl,
        context.sessionApiKey,
        command,
        context.workingDir,
        30,
      );
      if (result.exit_code !== 0) {
        return {
          ok: false,
          error: result.stderr?.trim() || "kt export failed",
        };
      }
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "kt export failed",
    };
  }
}

/** Reads the commit the workspace's KT docs describe, or null if none exist. */
export async function readWorkspaceKtCommit(
  context: KtRuntimeContext,
): Promise<string | null> {
  if (!context.conversationUrl || !context.workingDir) return null;
  try {
    const result = await AgentServerRuntimeService.executeCommand(
      context.conversationUrl,
      context.sessionApiKey,
      `test -f ${KT_META_FILE} && cat ${KT_META_FILE} || true`,
      context.workingDir,
      30,
    );
    const text = result.stdout?.trim();
    if (!text) return null;
    const meta = JSON.parse(text) as { commitSha?: unknown };
    return typeof meta.commitSha === "string" ? meta.commitSha : null;
  } catch {
    return null;
  }
}
