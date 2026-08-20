/**
 * The durable copy of workspace memory: a JSONL file inside the workspace
 * itself, so it travels with the code rather than with a browser profile, and
 * so two clients pointed at the same agent-server converge.
 *
 * All I/O goes through `AgentServerRuntimeService`, which needs a live
 * conversation runtime. That means this file can lag arbitrarily behind
 * localStorage -- the mirror queue and the pending count in Memory Health make
 * that lag visible instead of pretending it isn't there.
 *
 * SECURITY: record statements are agent-derived text and can contain anything,
 * including shell metacharacters. Payloads are base64-encoded and decoded
 * inside the sandbox; record content is never interpolated into a command.
 */
import AgentServerRuntimeService from "#/api/runtime-service/agent-server-runtime-service";
import type { MemoryRecord } from "#/lib/workspace-memory/types";

export const MEMORY_DIR = ".neodevex/memory";
export const MEMORY_FILE = ".neodevex/memory/records.jsonl";

/** Guards against a runaway file poisoning a page load. */
const MAX_LOAD_BYTES = 2_000_000;

export interface RuntimeContext {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string;
}

/** base64 is the whole point here: see the SECURITY note above. */
function encodePayload(text: string): string {
  if (typeof btoa === "function") {
    // btoa is latin1-only; go through UTF-8 bytes first.
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }
  // Node (tests, tooling).
  return Buffer.from(text, "utf-8").toString("base64");
}

/**
 * Exported so the shell-safety test can assert on the exact command string
 * without reaching through the service.
 */
export function buildAppendCommand(records: readonly MemoryRecord[]): string {
  const payload = records.map((record) => JSON.stringify(record)).join("\n");
  const encoded = encodePayload(`${payload}\n`);
  // `>>` never truncates; a partial write loses at most the tail of one batch,
  // which the queue will retry.
  return `mkdir -p ${MEMORY_DIR} && printf '%s' '${encoded}' | base64 -d >> ${MEMORY_FILE}`;
}

export function buildLoadCommand(): string {
  return `test -f ${MEMORY_FILE} && head -c ${MAX_LOAD_BYTES} ${MEMORY_FILE} || true`;
}

export async function appendRecordsToWorkspace(
  context: RuntimeContext,
  records: readonly MemoryRecord[],
): Promise<{ ok: boolean; error?: string }> {
  if (records.length === 0) return { ok: true };
  try {
    const result = await AgentServerRuntimeService.executeCommand(
      context.conversationUrl,
      context.sessionApiKey,
      buildAppendCommand(records),
      context.workingDir,
      30,
    );
    if (result.exit_code !== 0) {
      return { ok: false, error: result.stderr?.trim() || "append failed" };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "append failed",
    };
  }
}

/**
 * Recovery read. The file is append-only, so later lines win for a given id;
 * malformed lines are skipped rather than failing the whole load.
 */
export async function loadRecordsFromWorkspace(
  context: RuntimeContext,
  workspaceId: string,
): Promise<MemoryRecord[]> {
  try {
    const result = await AgentServerRuntimeService.executeCommand(
      context.conversationUrl,
      context.sessionApiKey,
      buildLoadCommand(),
      context.workingDir,
      30,
    );
    if (result.exit_code !== 0) return [];

    const byId = new Map<string, MemoryRecord>();
    result.stdout.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const record = JSON.parse(trimmed) as MemoryRecord;
        // A file lives inside exactly one workspace, but never trust that
        // blindly: a record claiming another workspace is dropped.
        if (record?.id && record.workspaceId === workspaceId) {
          byId.set(record.id, record);
        }
      } catch {
        // Truncated or hand-edited line: skip it.
      }
    });
    return Array.from(byId.values());
  } catch {
    return [];
  }
}
