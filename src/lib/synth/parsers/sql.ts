import { slugId, type Entity, type Field } from "../model";
import { normalizeType } from "../semantics";
import type { ParseResult } from "./types";

/**
 * SQL DDL parser for the dialects migrations are usually written in
 * (PostgreSQL, MySQL, SQLite). Reads `CREATE TABLE`, column constraints,
 * table-level `PRIMARY KEY` / `UNIQUE` / `FOREIGN KEY`, `CHECK (col IN (...))`
 * as enums, MySQL `ENUM(...)`, PostgreSQL `CREATE TYPE ... AS ENUM`, and
 * `ALTER TABLE ... ADD [CONSTRAINT] FOREIGN KEY`. Anything else is ignored
 * with a warning rather than failing the whole file.
 */

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "")
    .replace(/^#.*$/gm, "");
}

function unquote(name: string): string {
  return name
    .trim()
    .replace(/^[`"[]|[`"\]]$/g, "")
    .replace(/^\w+\./, "");
}

/** Split on commas that are not inside parentheses or quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of text) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function idList(text: string): string[] {
  return text
    .split(",")
    .map((s) => unquote(s))
    .filter(Boolean);
}

function enumLiterals(text: string): string[] {
  const quoted = [...text.matchAll(/'((?:[^']|'')*)'/g)].map((m) =>
    m[1].replace(/''/g, "'"),
  );
  if (quoted.length) return quoted;
  // Numeric lists: CHECK (rating IN (1, 2, 3))
  return text
    .split(",")
    .map((v) => v.trim())
    .filter((v) => /^-?\d+(\.\d+)?$/.test(v));
}

interface PendingFk {
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
}

export function parseSql(text: string, path = "schema.sql"): ParseResult {
  const sql = stripComments(text);
  const warnings: string[] = [];
  const entities: Entity[] = [];
  const pendingFks: PendingFk[] = [];
  const pgEnums = new Map<string, string[]>();

  for (const m of sql.matchAll(
    /CREATE\s+TYPE\s+([\w."`]+)\s+AS\s+ENUM\s*\(([^)]*)\)/gi,
  )) {
    pgEnums.set(unquote(m[1]).toLowerCase(), enumLiterals(m[2]));
  }

  const createRe =
    /CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."`[\]]+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = createRe.exec(sql))) {
    const tableName = unquote(match[1]);
    let depth = 1;
    let i = createRe.lastIndex;
    while (i < sql.length && depth > 0) {
      if (sql[i] === "(") depth += 1;
      else if (sql[i] === ")") depth -= 1;
      i += 1;
    }
    const body = sql.slice(createRe.lastIndex, i - 1);
    createRe.lastIndex = i;
    const fields: Field[] = [];
    const uniqueTogether: string[][] = [];
    for (const part of splitTopLevel(body)) {
      const upper = part.toUpperCase();
      if (/^(CONSTRAINT\s+\S+\s+)?PRIMARY\s+KEY/.test(upper)) {
        const cols = idList(part.match(/\(([^)]*)\)/)?.[1] ?? "");
        if (cols.length === 1) {
          const f = fields.find((x) => x.name === cols[0]);
          if (f) {
            f.primaryKey = true;
            f.unique = true;
            f.nullable = false;
          }
        } else if (cols.length > 1) {
          uniqueTogether.push(cols);
          for (const c of cols) {
            const f = fields.find((x) => x.name === c);
            if (f) f.nullable = false;
          }
        }
        continue;
      }
      if (/^(CONSTRAINT\s+\S+\s+)?UNIQUE/.test(upper)) {
        const cols = idList(part.match(/\(([^)]*)\)/)?.[1] ?? "");
        if (cols.length === 1) {
          const f = fields.find((x) => x.name === cols[0]);
          if (f) f.unique = true;
        } else if (cols.length > 1) uniqueTogether.push(cols);
        continue;
      }
      if (/^(CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY/.test(upper)) {
        const fk = part.match(
          /FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([\w."`[\]]+)\s*(?:\(([^)]*)\))?/i,
        );
        if (fk) {
          pendingFks.push({
            table: tableName,
            columns: idList(fk[1]),
            refTable: unquote(fk[2]),
            refColumns: fk[3] ? idList(fk[3]) : [],
          });
        }
        continue;
      }
      if (/^(CONSTRAINT\s+\S+\s+)?CHECK/.test(upper)) {
        const chk = part.match(
          /CHECK\s*\(\s*([\w"`]+)\s+IN\s*\(([^)]*)\)\s*\)/i,
        );
        if (chk) {
          const f = fields.find((x) => x.name === unquote(chk[1]));
          if (f) {
            f.enumValues = enumLiterals(chk[2]);
            f.type = "enum";
          }
        }
        continue;
      }
      if (/^(INDEX|KEY|FULLTEXT|SPATIAL)\b/.test(upper)) continue;

      // Column definition: name type [constraints]
      const col = part.match(
        /^([\w"`[\]]+)\s+([A-Za-z_][\w ]*?)(\s*\([^)]*\))?(\s+.*)?$/s,
      );
      if (!col) {
        warnings.push(
          `${path}: ${tableName}: could not read "${part.slice(0, 40)}"`,
        );
        continue;
      }
      const name = unquote(col[1]);
      const typeWord = col[2].trim();
      const typeArgs = col[3]?.trim() ?? "";
      const rest = (col[4] ?? "").trim();
      const restUpper = rest.toUpperCase();
      const field: Field = { name, type: normalizeType(typeWord) };
      if (/^ENUM$/i.test(typeWord)) {
        field.type = "enum";
        field.enumValues = enumLiterals(typeArgs);
      } else if (pgEnums.has(typeWord.toLowerCase())) {
        field.type = "enum";
        field.enumValues = pgEnums.get(typeWord.toLowerCase());
      }
      const lenMatch = typeArgs.match(/\((\d+)(?:\s*,\s*(\d+))?\)/);
      if (lenMatch) {
        if (field.type === "string") field.maxLength = Number(lenMatch[1]);
        if (field.type === "decimal" && lenMatch[2])
          field.scale = Number(lenMatch[2]);
      }
      if (/\bNOT\s+NULL\b/.test(restUpper)) field.nullable = false;
      else if (!/\bPRIMARY\s+KEY\b/.test(restUpper)) field.nullable = true;
      if (/\bPRIMARY\s+KEY\b/.test(restUpper)) {
        field.primaryKey = true;
        field.unique = true;
        field.nullable = false;
      }
      if (/\bUNIQUE\b/.test(restUpper)) field.unique = true;
      if (
        /\b(AUTO_INCREMENT|AUTOINCREMENT|GENERATED\s+(ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY|IDENTITY)\b/.test(
          restUpper,
        ) ||
        /^(SERIAL|BIGSERIAL|SMALLSERIAL)$/i.test(typeWord)
      ) {
        field.generated = true;
      }
      const def = rest.match(/\bDEFAULT\s+('(?:[^']|'')*'|[\w.()]+)/i);
      if (def) {
        const raw = def[1];
        if (
          /^(now\(\)|current_timestamp|gen_random_uuid\(\)|uuid_generate_v4\(\)|nextval)/i.test(
            raw,
          )
        ) {
          field.generated = true;
          if (/uuid/i.test(raw)) field.type = "uuid";
        } else {
          field.defaultValue = raw.replace(/^'|'$/g, "");
        }
      }
      const refs = rest.match(
        /\bREFERENCES\s+([\w."`[\]]+)\s*(?:\(([^)]*)\))?/i,
      );
      if (refs) {
        pendingFks.push({
          table: tableName,
          columns: [name],
          refTable: unquote(refs[1]),
          refColumns: refs[2] ? idList(refs[2]) : [],
        });
      }
      const chk = rest.match(
        /CHECK\s*\(\s*(?:[\w"`]+)\s+IN\s*\(([^)]*)\)\s*\)/i,
      );
      if (chk) {
        field.enumValues = enumLiterals(chk[1]);
        field.type = "enum";
      }
      fields.push(field);
    }
    entities.push({
      id: slugId(tableName),
      name: tableName,
      table: tableName,
      fields,
      evidence: [`${path}: CREATE TABLE ${tableName}`],
      source: "sql",
      uniqueTogether: uniqueTogether.length ? uniqueTogether : undefined,
    });
  }

  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:ONLY\s+)?([\w."`[\]]+)\s+ADD\s+(?:CONSTRAINT\s+\S+\s+)?FOREIGN\s+KEY\s*\(([^)]*)\)\s*REFERENCES\s+([\w."`[\]]+)\s*(?:\(([^)]*)\))?/gi,
  )) {
    pendingFks.push({
      table: unquote(m[1]),
      columns: idList(m[2]),
      refTable: unquote(m[3]),
      refColumns: m[4] ? idList(m[4]) : [],
    });
  }

  const byId = new Map(entities.map((e) => [e.id, e]));
  for (const fk of pendingFks) {
    const entity = byId.get(slugId(fk.table));
    const target = byId.get(slugId(fk.refTable));
    if (!entity) continue;
    fk.columns.forEach((column, i) => {
      const field = entity.fields.find((f) => f.name === column);
      if (!field) {
        warnings.push(
          `${path}: ${fk.table}.${column}: foreign key on unknown column`,
        );
        return;
      }
      const refField =
        fk.refColumns[i] ??
        target?.fields.find((f) => f.primaryKey)?.name ??
        "id";
      field.references = { entity: slugId(fk.refTable), field: refField };
      if (!target)
        warnings.push(
          `${path}: ${fk.table}.${column} references ${fk.refTable}, not in this file`,
        );
    });
  }
  if (entities.length === 0)
    warnings.push(`${path}: no CREATE TABLE statements found`);
  return { entities, warnings, format: "sql" };
}
