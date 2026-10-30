import { strFromU8, unzipSync, unzlibSync, inflateSync } from "fflate";

/**
 * Turns a requirements document (BRD, FRD, SRS, a data dictionary
 * spreadsheet, an exported wiki page) into plain markdown-ish text: `#`
 * headings, `- ` list items and `| a | b |` table rows. Everything the
 * extractor needs survives; styling does not. Pure and browser-safe: Word
 * and Excel files are zip archives read with fflate, PDFs are read for
 * their text operators (no font tables, so scanned or CID-encoded PDFs come
 * back unreadable and are handed to the agent instead).
 */

export const DOCUMENT_FORMATS = [
  "markdown",
  "text",
  "html",
  "docx",
  "xlsx",
  "pdf",
] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

/** File extensions read as documents (the picker's `accept`). */
export const DOCUMENT_EXTENSIONS = [
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".html",
  ".htm",
  ".docx",
  ".xlsx",
  ".pdf",
] as const;

/** Larger files are refused before reading (a BRD is rarely above 5 MB). */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Text beyond this is cut (and said so); keeps the extractor and the agent bounded. */
export const MAX_DOCUMENT_CHARS = 1_500_000;

export interface ReadDocumentResult {
  format: DocumentFormat;
  text: string;
  warnings: string[];
  /** The text is too thin to be the document's content (scanned PDF etc.). */
  unreadable: boolean;
}

export function documentFormatOf(name: string): DocumentFormat | null {
  const lower = name.toLowerCase();
  if (/\.(md|markdown)$/.test(lower)) return "markdown";
  if (/\.(txt|text)$/.test(lower)) return "text";
  if (/\.html?$/.test(lower)) return "html";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".pdf")) return "pdf";
  return null;
}

/** Whether a workspace path names a document (vs a schema or a sample). */
export function isDocumentPath(path: string): boolean {
  return documentFormatOf(path) !== null;
}

function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const text = new TextDecoder("utf-8").decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    const c = String(code);
    if (c[0] === "#") {
      const n =
        c[1] === "x" || c[1] === "X"
          ? parseInt(c.slice(2), 16)
          : parseInt(c.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : match;
    }
    return ENTITIES[c.toLowerCase()] ?? match;
  });
}

function cell(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
}

function tableToMarkdown(rows: string[][]): string {
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) return "";
  const lines = rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => {
      const padded = [...r];
      while (padded.length < width) padded.push("");
      return `| ${padded.map(cell).join(" | ")} |`;
    });
  if (lines.length === 0) return "";
  lines.splice(1, 0, `|${" --- |".repeat(width)}`);
  return lines.join("\n");
}

/* ── HTML ──────────────────────────────────────────────────────────────── */

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

export function htmlToText(html: string): string {
  let body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|head|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ");
  // Tables first, so their cells keep their rows.
  body = body.replace(/<table\b[\s\S]*?<\/table>/gi, (table) => {
    const rows = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)].map((tr) =>
      [...tr[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
        stripTags(m[1]),
      ),
    );
    return `\n\n${tableToMarkdown(rows)}\n\n`;
  });
  body = body
    .replace(
      /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_m, level, inner) =>
        `\n\n${"#".repeat(Number(level))} ${stripTags(inner)}\n\n`,
    )
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner) => {
      return `\n- ${stripTags(inner)}\n`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(
      /<\/(p|div|section|article|ul|ol|dl|dd|dt|blockquote|pre)>/gi,
      "\n\n",
    );
  return body
    .split("\n")
    .map((line) =>
      line.startsWith("| ")
        ? line
        : decodeEntities(line.replace(/<[^>]*>/g, " ")),
    )
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Word (.docx) ──────────────────────────────────────────────────────── */

function wordParagraphText(xml: string): string {
  let text = "";
  const re =
    /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  for (const m of xml.matchAll(re)) {
    if (m[1] !== undefined) text += decodeEntities(m[1]);
    else if (m[0].startsWith("<w:tab")) text += "\t";
    else text += "\n";
  }
  return text;
}

function wordParagraph(
  xml: string,
  headingStyles: Map<string, number>,
): string {
  const text = wordParagraphText(xml).trim();
  if (!text) return "";
  const style = /<w:pStyle\s+w:val="([^"]+)"/.exec(xml)?.[1] ?? "";
  const outline = /<w:outlineLvl\s+w:val="(\d)"/.exec(xml)?.[1];
  let level = headingStyles.get(style) ?? 0;
  if (!level) {
    const named = /^(?:heading|titre|überschrift|kop)\s*(\d)$/i.exec(style);
    if (named) level = Number(named[1]);
    else if (/^title$/i.test(style)) level = 1;
    else if (outline !== undefined) level = Number(outline) + 1;
  }
  if (level > 0 && level <= 6 && text.length <= 160) {
    return `${"#".repeat(level)} ${text.replace(/\s+/g, " ")}`;
  }
  if (/<w:numPr\b/.test(xml) || /^list/i.test(style)) {
    return `- ${text.replace(/\s+/g, " ")}`;
  }
  return text;
}

/** Heading levels of a document's own styles ("Heading2" may be renamed). */
function wordHeadingStyles(stylesXml: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!stylesXml) return map;
  for (const m of stylesXml.matchAll(
    /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g,
  )) {
    const name = /<w:name\s+w:val="([^"]+)"/.exec(m[2])?.[1] ?? "";
    const level =
      /heading\s*(\d)/i.exec(name)?.[1] ??
      /<w:outlineLvl\s+w:val="(\d)"/.exec(m[2])?.[1];
    if (level !== undefined) {
      const n = /heading/i.test(name) ? Number(level) : Number(level) + 1;
      if (n >= 1 && n <= 6) map.set(m[1], n);
    } else if (/^title$/i.test(name)) {
      map.set(m[1], 1);
    }
  }
  return map;
}

export function docxXmlToText(documentXml: string, stylesXml?: string): string {
  const headingStyles = wordHeadingStyles(stylesXml);
  const body =
    /<w:body>([\s\S]*)<\/w:body>/.exec(documentXml)?.[1] ?? documentXml;
  const out: string[] = [];
  // Top-level tables and paragraphs in document order. Nested tables are
  // flattened into their cell's text.
  const re =
    /<w:tbl>([\s\S]*?)<\/w:tbl>|<w:p\b[^>]*\/>|<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  for (const m of body.matchAll(re)) {
    if (m[1] !== undefined) {
      const rows = [...m[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map(
        (tr) =>
          [...tr[1].matchAll(/<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g)].map((tc) =>
            [...tc[1].matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
              .map((p) => wordParagraphText(p[1]).trim())
              .filter(Boolean)
              .join("; "),
          ),
      );
      const md = tableToMarkdown(rows);
      if (md) out.push("", md, "");
    } else if (m[2] !== undefined) {
      const line = wordParagraph(m[2], headingStyles);
      if (line) out.push(line.startsWith("#") ? `\n${line}\n` : line);
    }
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readDocx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (f) =>
      f.name === "word/document.xml" || f.name === "word/styles.xml",
  });
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("not a Word document (word/document.xml missing)");
  const styles = files["word/styles.xml"];
  return docxXmlToText(strFromU8(doc), styles ? strFromU8(styles) : undefined);
}

/* ── Excel (.xlsx) ─────────────────────────────────────────────────────── */

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function xlsxSheetToRows(
  sheetXml: string,
  shared: string[],
): string[][] {
  const rows: string[][] = [];
  for (const row of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let value = "";
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((m) => decodeEntities(m[1]))
          .join("");
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
        value = type === "s" ? (shared[Number(v)] ?? "") : decodeEntities(v);
      }
      const index = ref ? columnIndex(ref) : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = value;
    }
    rows.push(cells);
  }
  return rows;
}

function readXlsx(bytes: Uint8Array): string {
  const files = unzipSync(bytes, {
    filter: (f) =>
      f.name === "xl/workbook.xml" ||
      f.name === "xl/sharedStrings.xml" ||
      f.name === "xl/_rels/workbook.xml.rels" ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name),
  });
  const workbook = files["xl/workbook.xml"];
  if (!workbook)
    throw new Error("not an Excel workbook (xl/workbook.xml missing)");
  const sharedXml = files["xl/sharedStrings.xml"]
    ? strFromU8(files["xl/sharedStrings.xml"])
    : "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((si) =>
    [...si[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((m) => decodeEntities(m[1]))
      .join(""),
  );
  const rels = files["xl/_rels/workbook.xml.rels"]
    ? strFromU8(files["xl/_rels/workbook.xml.rels"])
    : "";
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(
    /<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"/g,
  )) {
    targets.set(m[1], m[2].replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const out: string[] = [];
  const sheets = [
    ...strFromU8(workbook).matchAll(
      /<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"/g,
    ),
  ];
  sheets.forEach((sheet, i) => {
    const target = targets.get(sheet[2]) ?? `worksheets/sheet${i + 1}.xml`;
    const xml = files[`xl/${target}`];
    if (!xml) return;
    const rows = xlsxSheetToRows(strFromU8(xml), shared);
    const md = tableToMarkdown(rows);
    if (md) out.push(`## ${decodeEntities(sheet[1])}`, "", md, "");
  });
  return out.join("\n").trim();
}

/* ── PDF ───────────────────────────────────────────────────────────────── */

function latin1(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return s;
}

function pdfLiteral(src: string, start: number): [string, number] {
  let depth = 1;
  let out = "";
  let i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === "\\") {
      const e = src[i + 1];
      const map: Record<string, string> = {
        n: "\n",
        r: "",
        t: " ",
        b: "",
        f: "",
        "(": "(",
        ")": ")",
        "\\": "\\",
      };
      if (e !== undefined && e in map) {
        out += map[e];
        i += 2;
      } else if (e !== undefined && /[0-7]/.test(e)) {
        const oct = /^[0-7]{1,3}/.exec(src.slice(i + 1))![0];
        out += String.fromCharCode(parseInt(oct, 8));
        i += 1 + oct.length;
      } else {
        i += 2;
      }
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
    out += c;
    i += 1;
  }
  return [out, i + 1];
}

function pdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    bytes.push(parseInt(clean.slice(i, i + 2).padEnd(2, "0"), 16));
  }
  // Two-byte strings with a zero high byte are UTF-16 text.
  if (bytes.length % 2 === 0 && bytes.length > 0) {
    const highZero = bytes.filter((b, i) => i % 2 === 0 && b === 0).length;
    if (highZero >= bytes.length / 2 - 1) {
      let s = "";
      for (let i = 0; i < bytes.length; i += 2) {
        s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
      }
      return s;
    }
  }
  return String.fromCharCode(...bytes);
}

/** The text drawn by one content stream (Tj, TJ, ', ") with line breaks. */
export function pdfContentText(content: string): string {
  let out = "";
  let i = 0;
  const pending: string[] = [];
  let lastNumber = 0;
  const numbers: number[] = [];
  while (i < content.length) {
    const c = content[i];
    if (c === "(") {
      const [s, next] = pdfLiteral(content, i + 1);
      pending.push(s);
      i = next;
      continue;
    }
    if (c === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i);
      if (end < 0) break;
      pending.push(pdfHex(content.slice(i + 1, end)));
      i = end + 1;
      continue;
    }
    if (c === "[") {
      pending.length = 0;
      i += 1;
      continue;
    }
    if (c === "]") {
      i += 1;
      continue;
    }
    if (/[-\d.]/.test(c)) {
      const m = /^-?\d*\.?\d+/.exec(content.slice(i, i + 32));
      if (m) {
        lastNumber = Number(m[0]);
        numbers.push(lastNumber);
        if (numbers.length > 6) numbers.shift();
        // Inside a TJ array a large negative kern is a word gap.
        if (lastNumber < -180 && pending.length) pending.push(" ");
        i += m[0].length;
        continue;
      }
    }
    if (/[A-Za-z'"*]/.test(c)) {
      const op = /^[A-Za-z'"*]+/.exec(content.slice(i, i + 8))![0];
      if (op === "Tj" || op === "TJ" || op === "'" || op === '"') {
        if (op !== "Tj" && op !== "TJ") out += "\n";
        out += pending.join("");
        pending.length = 0;
      } else if (op === "Td" || op === "TD") {
        const ty = numbers[numbers.length - 1] ?? 0;
        out += Math.abs(ty) > 0.5 ? "\n" : " ";
      } else if (op === "T*") {
        out += "\n";
      } else if (op === "Tm" || op === "ET") {
        out += "\n";
      }
      if (op !== "Tj" && op !== "TJ") pending.length = 0;
      numbers.length = 0;
      i += op.length;
      continue;
    }
    i += 1;
  }
  return out;
}

function readPdf(bytes: Uint8Array): string {
  const raw = latin1(bytes);
  if (!raw.startsWith("%PDF")) throw new Error("not a PDF file");
  const parts: string[] = [];
  const re = /<<((?:[^<>]|<<[^<>]*>>|<[^<>]*>){0,4000}?)>>\s*stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const dict = m[1];
    const start = re.lastIndex;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    re.lastIndex = end;
    if (
      /\/(Type\s*\/(XObject|XRef|ObjStm|FontDescriptor)|Subtype\s*\/Image|Length1|Length2)/.test(
        dict,
      )
    ) {
      continue;
    }
    let data = bytes.subarray(start, end);
    while (
      data.length &&
      (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d)
    ) {
      data = data.subarray(0, data.length - 1);
    }
    let content: string;
    if (/\/FlateDecode/.test(dict)) {
      try {
        content = latin1(unzlibSync(data));
      } catch {
        try {
          content = latin1(inflateSync(data));
        } catch {
          continue;
        }
      }
    } else if (/\/Filter/.test(dict)) {
      continue;
    } else {
      content = latin1(data);
    }
    if (/\bBT\b/.test(content)) parts.push(pdfContentText(content));
  }
  return parts
    .join("\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Entry point ───────────────────────────────────────────────────────── */

/** Share of characters that are letters, digits, spaces or punctuation. */
export function readableShare(text: string): number {
  if (!text) return 0;
  const sample = text.slice(0, 20_000);
  const ok = sample.match(/[\p{L}\p{N}\s.,;:()'"%$&/\-–—|#*]/gu)?.length ?? 0;
  return ok / sample.length;
}

export function readDocument(
  name: string,
  bytes: Uint8Array,
): ReadDocumentResult {
  const format = documentFormatOf(name) ?? "text";
  const warnings: string[] = [];
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    return {
      format,
      text: "",
      warnings: [`${name}: larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`],
      unreadable: true,
    };
  }
  let text = "";
  try {
    switch (format) {
      case "docx":
        text = readDocx(bytes);
        break;
      case "xlsx":
        text = readXlsx(bytes);
        break;
      case "pdf":
        text = readPdf(bytes);
        break;
      case "html":
        text = htmlToText(decodeText(bytes));
        break;
      default: {
        const decoded = decodeText(bytes);
        text = /^\s*<(!doctype html|html)\b/i.test(decoded)
          ? htmlToText(decoded)
          : decoded.replace(/\r\n?/g, "\n");
      }
    }
  } catch (error) {
    return {
      format,
      text: "",
      warnings: [
        `${name}: could not be read (${error instanceof Error ? error.message : String(error)})`,
      ],
      unreadable: true,
    };
  }
  if (text.length > MAX_DOCUMENT_CHARS) {
    warnings.push(
      `${name}: only the first ${MAX_DOCUMENT_CHARS.toLocaleString("en-US")} characters were read`,
    );
    text = text.slice(0, MAX_DOCUMENT_CHARS);
  }
  const words = text.match(/\p{L}{2,}/gu)?.length ?? 0;
  const unreadable = words < 3 || readableShare(text) < 0.7;
  if (unreadable) {
    warnings.push(
      format === "pdf"
        ? `${name}: the PDF has no readable text layer here (scanned or font-encoded); the agent will extract it`
        : `${name}: almost no readable text`,
    );
  }
  return {
    format,
    text: unreadable && format === "pdf" ? "" : text,
    warnings,
    unreadable,
  };
}
