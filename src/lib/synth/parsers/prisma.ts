import { slugId, type Entity, type Field } from "../model";
import { normalizeType } from "../semantics";
import type { ParseResult } from "./types";

/**
 * Prisma schema parser (`schema.prisma`). Covers what real schemas use:
 * models, enums, scalar fields with `?`/`[]`, `@id`, `@unique`, `@default`,
 * `@map`, `@@map`, `@@unique`, `@@id`, `@db.VarChar(n)`, and `@relation`
 * blocks whose `fields:`/`references:` make the foreign keys.
 */

const SCALARS = new Set([
  "String",
  "Int",
  "BigInt",
  "Float",
  "Decimal",
  "Boolean",
  "DateTime",
  "Json",
  "Bytes",
]);

function stripComments(text: string): string {
  return text.replace(/\/\/.*$/gm, "");
}

function blocks(
  text: string,
  keyword: "model" | "enum",
): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = new RegExp(`\\b${keyword}\\s+(\\w+)\\s*\\{`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") depth -= 1;
      i += 1;
    }
    out.push({ name: m[1], body: text.slice(re.lastIndex, i - 1) });
    re.lastIndex = i;
  }
  return out;
}

function attr(line: string, name: string): string | null {
  const re = new RegExp(`@${name}(?:\\(([^)]*(?:\\([^)]*\\)[^)]*)*)\\))?`);
  const m = line.match(re);
  if (!m) return null;
  return m[1] ?? "";
}

function listArg(args: string, key: string): string[] {
  const m = args.match(new RegExp(`${key}\\s*:\\s*\\[([^\\]]*)\\]`));
  return m
    ? m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

function stripQuotes(s: string): string {
  return s.replace(/^["']|["']$/g, "");
}

export function parsePrisma(text: string, path = "schema.prisma"): ParseResult {
  const clean = stripComments(text);
  const warnings: string[] = [];
  const enums = new Map<string, string[]>();
  for (const e of blocks(clean, "enum")) {
    enums.set(
      e.name,
      e.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("@@"))
        .map((l) => {
          const mapped = attr(l, "map");
          return mapped ? stripQuotes(mapped) : l.split(/\s+/)[0];
        }),
    );
  }
  const modelBlocks = blocks(clean, "model");
  const modelNames = new Set(modelBlocks.map((m) => m.name));
  const entities: Entity[] = [];
  for (const model of modelBlocks) {
    const entityId = slugId(model.name);
    const fields: Field[] = [];
    const uniqueTogether: string[][] = [];
    let table: string | undefined;
    const pendingRelations: {
      fields: string[];
      references: string[];
      target: string;
    }[] = [];
    for (const raw of model.body.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("@@map")) {
        const a = attr(line, "@map") ?? attr(line, "map");
        if (a) table = stripQuotes(a);
        continue;
      }
      if (line.startsWith("@@unique")) {
        const a = attr(line, "@unique") ?? attr(line, "unique") ?? "";
        const names = (a.match(/\[([^\]]*)\]/)?.[1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length) uniqueTogether.push(names);
        continue;
      }
      if (line.startsWith("@@id")) {
        const a = attr(line, "@id") ?? attr(line, "id") ?? "";
        const names = (a.match(/\[([^\]]*)\]/)?.[1] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length) uniqueTogether.push(names);
        continue;
      }
      if (line.startsWith("@@")) continue;
      const m = line.match(/^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (!m) continue;
      const [, name, typeName, isList, isOptional, rest] = m;
      const relation = attr(rest, "relation");
      if (modelNames.has(typeName)) {
        // Relation field: the FK lives on the scalar(s) in `fields:`.
        if (relation !== null) {
          const fkFields = listArg(relation, "fields");
          const refs = listArg(relation, "references");
          if (fkFields.length) {
            pendingRelations.push({
              fields: fkFields,
              references: refs,
              target: typeName,
            });
          }
        }
        continue;
      }
      if (isList) {
        fields.push({
          name,
          type: "array",
          nullable: Boolean(isOptional),
          items: normalizeType(typeName),
        });
        continue;
      }
      let type = normalizeType(typeName);
      let enumValues: string[] | undefined;
      if (enums.has(typeName)) {
        type = "enum";
        enumValues = enums.get(typeName);
      } else if (!SCALARS.has(typeName)) {
        warnings.push(
          `${path}: ${model.name}.${name} has unknown type ${typeName}`,
        );
      }
      const field: Field = { name, type };
      if (enumValues) field.enumValues = enumValues;
      if (isOptional) field.nullable = true;
      if (attr(rest, "id") !== null) {
        field.primaryKey = true;
        field.unique = true;
      }
      if (attr(rest, "unique") !== null) field.unique = true;
      const def = attr(rest, "default");
      if (def !== null) {
        if (/autoincrement|uuid|cuid|now|dbgenerated/.test(def)) {
          field.generated = true;
          if (/uuid/.test(def)) field.type = "uuid";
        } else {
          field.defaultValue = stripQuotes(def);
        }
      }
      const dbType = rest.match(/@db\.(\w+)(?:\((\d+)(?:,\s*(\d+))?\))?/);
      if (dbType) {
        if (/VarChar|Char/i.test(dbType[1]) && dbType[2])
          field.maxLength = Number(dbType[2]);
        if (/Decimal/i.test(dbType[1]) && dbType[3])
          field.scale = Number(dbType[3]);
        if (/Uuid/i.test(dbType[1])) field.type = "uuid";
        if (/Text/i.test(dbType[1])) field.type = "text";
      }
      if (field.type === "unknown" && SCALARS.has(typeName)) {
        field.type = typeName === "BigInt" ? "integer" : "string";
      }
      fields.push(field);
    }
    for (const rel of pendingRelations) {
      rel.fields.forEach((fk, i) => {
        const field = fields.find((f) => f.name === fk);
        if (!field) {
          warnings.push(
            `${path}: ${model.name}: relation field ${fk} not declared`,
          );
          return;
        }
        field.references = {
          entity: slugId(rel.target),
          field: rel.references[i] ?? "id",
        };
      });
    }
    entities.push({
      id: entityId,
      name: model.name,
      table: table ?? undefined,
      fields,
      evidence: [`${path}: model ${model.name}`],
      source: "prisma",
      uniqueTogether: uniqueTogether.length ? uniqueTogether : undefined,
    });
  }
  return { entities, warnings, format: "prisma" };
}
