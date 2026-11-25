/**
 * Structure-aware chunking for Neo RAG (specs/neo-rag.md, RAG-003).
 *
 * A chunk is the unit that is embedded, retrieved and cited, so it should be
 * one coherent piece of meaning: a markdown section, a function, a ticket.
 * Splitting by raw character count cuts sentences and code in half and loses
 * the heading that says what the text is about. Here:
 *
 * - Markdown / prose: split by headings and keep the heading trail
 *   ("Setup > Database") as `headingPath`; sections above the target size
 *   are split on paragraph boundaries with a small overlap.
 * - Code: split at top-level declarations (function, class, def, func, ...)
 *   so a chunk is one symbol; the file path is the heading.
 * - Everything else: paragraphs packed up to the target size.
 *
 * Pure and dependency-free: the same input always gives the same chunks.
 */

export interface Chunk {
  content: string;
  headingPath: string;
  tokens: number;
}

export interface ChunkOptions {
  /** Target size of one chunk in tokens (~4 characters each). */
  targetTokens?: number;
  /** Tokens repeated from the end of the previous piece when a section is split. */
  overlapTokens?: number;
}

export const DEFAULT_TARGET_TOKENS = 400;
export const DEFAULT_OVERLAP_TOKENS = 60;
const MIN_CHUNK_CHARS = 20;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function makeChunk(content: string, headingPath: string): Chunk {
  const trimmed = content.trim();
  return { content: trimmed, headingPath, tokens: estimateTokens(trimmed) };
}

/** Pack paragraphs into pieces of about `target` tokens, overlapping a little. */
function packParagraphs(
  text: string,
  headingPath: string,
  target: number,
  overlap: number,
): Chunk[] {
  const maxChars = target * 4;
  const overlapChars = overlap * 4;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    // A single paragraph longer than the target is cut on sentence ends,
    // then on hard length as a last resort (minified text, long tables).
    .flatMap((p) => {
      if (p.length <= maxChars) return [p];
      const sentences = p.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [p];
      const pieces: string[] = [];
      let current = "";
      for (const sentence of sentences) {
        if ((current + sentence).length > maxChars && current) {
          pieces.push(current);
          current = "";
        }
        if (sentence.length > maxChars) {
          for (let i = 0; i < sentence.length; i += maxChars) {
            pieces.push(sentence.slice(i, i + maxChars));
          }
        } else {
          current += sentence;
        }
      }
      if (current) pieces.push(current);
      return pieces.map((s) => s.trim()).filter(Boolean);
    });

  const chunks: Chunk[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (current && (current + "\n\n" + paragraph).length > maxChars) {
      chunks.push(makeChunk(current, headingPath));
      const tail = current.slice(-overlapChars);
      const cut = tail.indexOf(" ");
      current = overlapChars > 0 && cut >= 0 ? tail.slice(cut + 1) : "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current.trim()) chunks.push(makeChunk(current, headingPath));
  return chunks.filter((c) => c.content.length >= MIN_CHUNK_CHARS);
}

/** Markdown and markdown-like text (KT pages, READMEs, converted documents). */
export function chunkMarkdown(
  text: string,
  options: ChunkOptions = {},
): Chunk[] {
  const target = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const overlap = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const trail: string[] = [];
  const sections: { heading: string; body: string[] }[] = [
    { heading: "", body: [] },
  ];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const match = !inFence && line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (match) {
      const level = match[1].length;
      trail.length = level - 1;
      trail[level - 1] = match[2].trim();
      sections.push({
        heading: trail.filter(Boolean).join(" > "),
        body: [],
      });
    } else {
      sections[sections.length - 1].body.push(line);
    }
  }

  const chunks: Chunk[] = [];
  // Small neighbouring sections under the same parent are merged so a page
  // of one-line sections does not become twenty tiny, context-free chunks.
  let pending: { heading: string; text: string } | null = null;
  const flush = () => {
    if (pending) {
      chunks.push(
        ...packParagraphs(pending.text, pending.heading, target, overlap),
      );
      pending = null;
    }
  };
  for (const section of sections) {
    const body = section.body.join("\n").trim();
    if (!body) continue;
    const textWithTitle = section.heading
      ? `${section.heading.split(" > ").pop()}\n\n${body}`
      : body;
    if (
      pending &&
      estimateTokens(pending.text + textWithTitle) <= target &&
      parentOf(pending.heading) === parentOf(section.heading)
    ) {
      pending.text += `\n\n${textWithTitle}`;
      continue;
    }
    flush();
    pending = { heading: section.heading, text: textWithTitle };
  }
  flush();
  return chunks;
}

function parentOf(headingPath: string): string {
  return headingPath.split(" > ").slice(0, -1).join(" > ");
}

const DECLARATION =
  /^(export\s+(default\s+)?)?(async\s+)?(function\*?|class|interface|type|enum|const|let|def|func|fn|pub\s+fn|impl|struct|trait|module|public\s+(static\s+)?(class|interface|[\w<>[\]]+\s+\w+\s*\()|private\s+[\w<>[\]]+\s+\w+\s*\(|protected\s+[\w<>[\]]+\s+\w+\s*\()\b/;

const CODE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|cs|php|rs|swift|scala|c|h|cpp|hpp|sql|sh|proto|graphql|vue|svelte)$/i;

export function isCodePath(path: string): boolean {
  return CODE_EXTENSIONS.test(path);
}

/** Source code: one chunk per top-level declaration, imports folded into the first. */
export function chunkCode(
  path: string,
  text: string,
  options: ChunkOptions = {},
): Chunk[] {
  const target = options.targetTokens ?? DEFAULT_TARGET_TOKENS;
  const maxChars = target * 4 * 1.5;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: { start: number; lines: string[] }[] = [
    { start: 1, lines: [] },
  ];
  lines.forEach((line, index) => {
    const startsDeclaration =
      DECLARATION.test(line) && !/^\s/.test(line) && index > 0;
    const current = blocks[blocks.length - 1];
    if (startsDeclaration && current.lines.join("\n").trim().length > 0) {
      blocks.push({ start: index + 1, lines: [line] });
    } else {
      current.lines.push(line);
    }
  });

  const chunks: Chunk[] = [];
  let pending: { start: number; end: number; text: string } | null = null;
  const emit = (start: number, end: number, body: string) => {
    if (body.trim().length < MIN_CHUNK_CHARS) return;
    if (body.length <= maxChars) {
      chunks.push(makeChunk(body, `${path}:${start}-${end}`));
      return;
    }
    // A very long symbol: cut on blank lines, keep line numbers honest.
    const bodyLines = body.split("\n");
    let pieceStart = 0;
    let piece: string[] = [];
    bodyLines.forEach((line, i) => {
      piece.push(line);
      const size = piece.join("\n").length;
      if (size >= maxChars || (size >= maxChars * 0.6 && line.trim() === "")) {
        chunks.push(
          makeChunk(
            piece.join("\n"),
            `${path}:${start + pieceStart}-${start + i}`,
          ),
        );
        pieceStart = i + 1;
        piece = [];
      }
    });
    if (piece.join("\n").trim().length >= MIN_CHUNK_CHARS) {
      chunks.push(
        makeChunk(
          piece.join("\n"),
          `${path}:${start + pieceStart}-${start + bodyLines.length - 1}`,
        ),
      );
    }
  };
  for (const block of blocks) {
    const body = block.lines.join("\n");
    const end = block.start + block.lines.length - 1;
    if (pending && (pending.text + body).length <= maxChars * 0.66) {
      pending.text += `\n${body}`;
      pending.end = end;
      continue;
    }
    if (pending) emit(pending.start, pending.end, pending.text);
    pending = { start: block.start, end, text: body };
  }
  if (pending) emit(pending.start, pending.end, pending.text);
  return chunks;
}

export function chunkPlain(text: string, options: ChunkOptions = {}): Chunk[] {
  return packParagraphs(
    text.replace(/\r\n?/g, "\n"),
    "",
    options.targetTokens ?? DEFAULT_TARGET_TOKENS,
    options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
  );
}

/** Picks the chunker from the file name; markdown is the default for prose. */
export function chunkDocument(
  name: string,
  text: string,
  options: ChunkOptions = {},
): Chunk[] {
  if (isCodePath(name)) return chunkCode(name, text, options);
  if (/\.(json|ya?ml|toml|ini|cfg|csv|tsv)$/i.test(name)) {
    return chunkPlain(text, options);
  }
  return chunkMarkdown(text, options);
}
