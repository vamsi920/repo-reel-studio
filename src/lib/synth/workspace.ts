import { buildWriteFileCommands } from "#/lib/knowledge/kt-workspace-export";
import type { RunInWorkspace } from "#/lib/modernization/replay-harness";
import type { ExportedFile } from "./exporters";

/**
 * Reading schema files from, and writing generated datasets into, the
 * project's workspace through the agent-server runtime. Content travels
 * base64-encoded, never interpolated raw into a shell command.
 */

/** Where runs land in the workspace, relative to the project root. */
export const SYNTH_OUTPUT_DIR = "synthetic-data";
/** Keeps generated data out of the user's commits. */
export const GIT_EXCLUDE_ENTRY = `${SYNTH_OUTPUT_DIR}/`;
/** Largest prefix of a workspace file the studio reads (schemas, samples). */
export const MAX_READ_BYTES = 4 * 1024 * 1024;
/** Above this, a run is kept in the browser (download) and not written. */
export const MAX_WORKSPACE_BYTES = 24 * 1024 * 1024;

function decodeBase64(text: string): string {
  const binary =
    typeof atob === "function"
      ? atob(text)
      : Buffer.from(text, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Reads a text file from the workspace; null when missing or unreadable. */
export async function readWorkspaceFile(
  run: RunInWorkspace,
  path: string,
  maxBytes = MAX_READ_BYTES,
): Promise<string | null> {
  if (!/^[\w./@-]+$/.test(path) || path.includes("..")) return null;
  try {
    // Bounded: a sample export can be huge, its first megabytes are enough.
    const result = await run(
      `test -f '${path}' && head -c ${Math.floor(maxBytes)} '${path}' | base64 | tr -d '\\n' || true`,
    );
    const text = result.stdout?.trim();
    if (!text) return null;
    return decodeBase64(text);
  } catch {
    return null;
  }
}

/** Lists candidate schema files in the workspace (bounded, sorted). */
export async function findSchemaFiles(run: RunInWorkspace): Promise<string[]> {
  try {
    const result = await run(
      "find . -type f \\( -name 'schema.prisma' -o -name '*.sql' -o -name 'openapi.json' -o -name 'swagger.json' -o -name '*.schema.json' -o \\( \\( -name '*.csv' -o -name '*.json' \\) \\( -path '*seed*' -o -path '*fixture*' -o -path '*sample*' -o -path '*/data/*' \\) \\) \\) -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/synthetic-data/*' -not -name 'package*.json' -not -name 'tsconfig*.json' 2>/dev/null | head -60",
    );
    return (result.stdout ?? "")
      .split("\n")
      .map((l) => l.trim().replace(/^\.\//, ""))
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

export interface WriteRunResult {
  ok: boolean;
  dir: string;
  written: string[];
  error?: string;
}

/** Writes a run's files under `synthetic-data/<runId>/`. Never throws. */
export async function writeRunToWorkspace(
  run: RunInWorkspace,
  runId: string,
  files: ExportedFile[],
): Promise<WriteRunResult> {
  const dir = `${SYNTH_OUTPUT_DIR}/${runId}`;
  const written: string[] = [];
  try {
    const dirs = new Set<string>([dir]);
    for (const file of files) {
      const parts = file.path.split("/");
      if (parts.length > 1) dirs.add(`${dir}/${parts.slice(0, -1).join("/")}`);
    }
    const prepare = [
      `mkdir -p ${[...dirs].map((d) => `'${d}'`).join(" ")}`,
      `if [ -d .git/info ]; then grep -qxF '${GIT_EXCLUDE_ENTRY}' .git/info/exclude 2>/dev/null || echo '${GIT_EXCLUDE_ENTRY}' >> .git/info/exclude; fi`,
    ].join(" && ");
    const prepared = await run(prepare);
    if (prepared.exit_code !== 0) {
      return {
        ok: false,
        dir,
        written,
        error: prepared.stderr || "could not create the output directory",
      };
    }
    for (const file of files) {
      const commands = buildWriteFileCommands({
        path: `${dir}/${file.path}`,
        content: file.content,
      });
      for (const command of commands) {
        // Sequential: chunks of one file must land in order.
        const result = await run(command);
        if (result.exit_code !== 0) {
          return {
            ok: false,
            dir,
            written,
            error: result.stderr || `failed writing ${file.path}`,
          };
        }
      }
      written.push(`${dir}/${file.path}`);
    }
    return { ok: true, dir, written };
  } catch (error) {
    return {
      ok: false,
      dir,
      written,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
