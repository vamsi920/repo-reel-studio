import type { Row } from "./model";

/**
 * Reading tabular files the user loads (a sample to learn from, or a real
 * export to mask): RFC 4180 CSV with a header row, or a JSON array of
 * objects. Values stay strings from CSV; JSON keeps its types.
 */

export interface TabularFile {
  columns: string[];
  rows: Row[];
}

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF), header row first. */
export function parseCsv(text: string): TabularFile {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      record.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || record.length) {
    record.push(cell);
    records.push(record);
  }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...body] = nonEmpty;
  if (!header?.length) return { columns: [], rows: [] };
  const columns = header.map((c) => c.trim());
  const rows = body.map((values) => {
    const row: Row = {};
    columns.forEach((c, i) => {
      const v = values[i];
      row[c] = v === undefined || v === "" ? null : v;
    });
    return row;
  });
  return { columns, rows };
}

/**
 * A CSV with a header row, or a JSON array of objects. Null if neither.
 * `truncated`: the text is a prefix of a bigger file, so a CSV's last,
 * possibly partial line is dropped.
 */
export function parseTabular(
  text: string,
  truncated = false,
): TabularFile | null {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("[")) {
    try {
      const data = JSON.parse(trimmed);
      if (!Array.isArray(data)) return null;
      const rows = data.filter(
        (r): r is Row =>
          Boolean(r) && typeof r === "object" && !Array.isArray(r),
      );
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      return columns.length ? { columns, rows } : null;
    } catch {
      return null;
    }
  }
  const body = truncated ? text.slice(0, text.lastIndexOf("\n") + 1) : text;
  const csv = parseCsv(body);
  return csv.columns.length ? csv : null;
}
