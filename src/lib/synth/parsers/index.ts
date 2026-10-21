import { withInferredSemantics } from "../semantics";
import { parseJsonSchema } from "./json-schema";
import { parsePrisma } from "./prisma";
import { parseSql } from "./sql";
import type { ParseResult, SchemaFormat } from "./types";

export type { ParseResult, SchemaFormat } from "./types";
export { parseJsonSchema, parsePrisma, parseSql };

/** Which parser fits a file, from its name first and its contents second. */
export function detectSchemaFormat(
  path: string,
  content: string,
): SchemaFormat | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".prisma")) return "prisma";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".json")) {
    return /"(openapi|swagger)"\s*:/.test(content) ? "openapi" : "json-schema";
  }
  const head = content.slice(0, 4000);
  if (
    /\bmodel\s+\w+\s*\{/.test(head) &&
    /\bdatasource\b|\bgenerator\b|@id\b/.test(head)
  ) {
    return "prisma";
  }
  if (/create\s+table/i.test(head)) return "sql";
  if (/^\s*\{/.test(head)) {
    return /"(openapi|swagger)"\s*:/.test(head) ? "openapi" : "json-schema";
  }
  return null;
}

/** The files Neo Synth can read on its own, for the agent and the file picker. */
export const SCHEMA_FILE_GLOBS = [
  "**/schema.prisma",
  "**/*.sql",
  "**/openapi.json",
  "**/swagger.json",
  "**/*.schema.json",
];

export function parseSchemaFile(path: string, content: string): ParseResult {
  const format = detectSchemaFormat(path, content);
  let result: ParseResult;
  switch (format) {
    case "prisma":
      result = parsePrisma(content, path);
      break;
    case "sql":
      result = parseSql(content, path);
      break;
    case "json-schema":
    case "openapi":
      result = parseJsonSchema(content, path);
      break;
    default:
      return {
        entities: [],
        warnings: [
          `${path}: unrecognised schema format (prisma, sql, json-schema, openapi)`,
        ],
        format: "json-schema",
      };
  }
  return { ...result, entities: result.entities.map(withInferredSemantics) };
}
