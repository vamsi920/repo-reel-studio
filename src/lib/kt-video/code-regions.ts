/**
 * Region index: the real, addressable pieces of each file a tutorial may
 * show. The script model only ever references regions by id (or explicit
 * line ranges that are clamped to the file), so a visual can't point at
 * code that doesn't exist.
 */
import { extractSymbols, type FileSymbol } from "./build-manifest";

export interface CodeRegion {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  symbol?: string;
  kind: FileSymbol["kind"] | "head" | "chunk";
  /** First meaningful line, for the prompt's region listing. */
  preview: string;
}

const MAX_REGION_LINES = 70;
const HEAD_LINES = 24;
const MAX_CHUNKS_PER_FILE = 6;
const CHUNK_LINES = 40;

export const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  kt: "kotlin",
  swift: "swift",
  scala: "scala",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  vue: "markup",
  svelte: "markup",
  html: "markup",
  css: "css",
  sql: "sql",
  toml: "toml",
};

export function languageForPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "clike";
}

function docCommentStart(lines: string[], declIndex: number): number {
  let i = declIndex - 1;
  // Decorators / annotations directly above the declaration belong to it.
  while (i >= 0 && /^\s*(@\w|#\[)/.test(lines[i])) i -= 1;
  // A contiguous comment block directly above.
  let j = i;
  while (j >= 0 && /^\s*(\/\/|\*|\/\*|#|"""|''')/.test(lines[j])) j -= 1;
  if (j < i) return j + 1;
  return i + 1;
}

function trimTrailingBlank(
  lines: string[],
  start: number,
  end: number,
): number {
  let e = end;
  while (e > start && lines[e - 1].trim() === "") e -= 1;
  return e;
}

export function buildRegionIndex(files: Record<string, string>): CodeRegion[] {
  const regions: CodeRegion[] = [];
  let counter = 0;
  const nextId = () => {
    counter += 1;
    return `R${counter}`;
  };

  for (const [path, content] of Object.entries(files)) {
    const lines = content.split("\n");
    const total = lines.length;
    const symbols = extractSymbols(path, content)
      .filter((s, i, arr) => arr.findIndex((o) => o.line === s.line) === i)
      .sort((a, b) => a.line - b.line);

    // The header stops before the first symbol's own doc comment, so the
    // two regions never show the same lines.
    const firstSymbolLine = symbols[0]
      ? docCommentStart(lines, symbols[0].line - 1) + 1
      : total + 1;
    const headEnd = trimTrailingBlank(
      lines,
      1,
      Math.min(HEAD_LINES, firstSymbolLine - 1, total),
    );
    if (headEnd >= 2) {
      regions.push({
        id: nextId(),
        path,
        startLine: 1,
        endLine: headEnd,
        kind: "head",
        preview:
          lines
            .slice(0, headEnd)
            .find((l) => l.trim())
            ?.trim() ?? "",
      });
    }

    if (symbols.length) {
      symbols.forEach((symbol, i) => {
        const declIndex = symbol.line - 1;
        const start = docCommentStart(lines, declIndex) + 1;
        const nextLine = symbols[i + 1]?.line ?? total + 1;
        const rawEnd = Math.min(
          nextLine - 1,
          symbol.line + MAX_REGION_LINES - 1,
          total,
        );
        const end = Math.max(
          symbol.line,
          trimTrailingBlank(lines, symbol.line, rawEnd),
        );
        regions.push({
          id: nextId(),
          path,
          startLine: start,
          endLine: end,
          symbol: symbol.name,
          kind: symbol.kind,
          preview: lines[declIndex].trim(),
        });
      });
    } else {
      for (
        let start = headEnd + 1, n = 0;
        start <= total && n < MAX_CHUNKS_PER_FILE;
        start += CHUNK_LINES, n += 1
      ) {
        const end = trimTrailingBlank(
          lines,
          start,
          Math.min(total, start + CHUNK_LINES - 1),
        );
        if (end < start) continue;
        regions.push({
          id: nextId(),
          path,
          startLine: start,
          endLine: end,
          kind: "chunk",
          preview:
            lines
              .slice(start - 1, end)
              .find((l) => l.trim())
              ?.trim() ?? "",
        });
      }
    }
  }
  return regions;
}

export function regionsForPath(
  regions: CodeRegion[],
  path: string,
): CodeRegion[] {
  return regions.filter((r) => r.path === path);
}

/** Line-numbered excerpt of a file range, for prompts. */
export function numberedExcerpt(
  content: string,
  startLine: number,
  endLine: number,
  maxLines = 90,
): string {
  const lines = content.split("\n");
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, endLine, start + maxLines - 1);
  const width = String(end).length;
  return lines
    .slice(start - 1, end)
    .map((line, i) => `${String(start + i).padStart(width, " ")}| ${line}`)
    .join("\n");
}
