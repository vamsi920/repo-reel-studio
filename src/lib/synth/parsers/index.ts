import { withInferredSemantics } from "../semantics";
import { parseJsonSchema } from "./json-schema";
import { parsePrisma } from "./prisma";
import { parseSql } from "./sql";
import type { ParseResult, SchemaFormat } from "./types";
import { parseTabular } from "../tabular";
import { inferEntityFromSample } from "../sample";

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
  if (lower.endsWith(".csv")) return "sample";
  if (lower.endsWith(".json")) {
    if (/^\s*\[/.test(content)) return "sample";
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
  if (/^\s*\[\s*\{/.test(head)) return "sample";
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
  "**/{seed,seeds,fixtures,samples,sample,data}/**/*.{csv,json}",
];

export function parseSchemaFile(
  path: string,
  content: string,
  options: { truncated?: boolean } = {},
): ParseResult {
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
    case "sample": {
      const table = parseTabular(content, options.truncated);
      if (!table || table.rows.length === 0) {
        return {
          entities: [],
          warnings: [
            `${path}: no rows found (CSV with a header row, or a JSON array of objects)`,
          ],
          format: "sample",
        };
      }
      const base =
        path
          .split("/")
          .pop()
          ?.replace(/\.[^.]+$/, "") || "sample";
      const inferred = inferEntityFromSample(
        base,
        table.columns,
        table.rows,
        path,
      );
      return {
        entities: [inferred.entity],
        warnings: [],
        format: "sample",
        sampleRows: inferred.rows,
        detectedByValue: inferred.detectedByValue,
      };
    }
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
