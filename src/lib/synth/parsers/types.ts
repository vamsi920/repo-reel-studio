import type { Entity } from "../model";

export type SchemaFormat = "prisma" | "sql" | "json-schema" | "openapi";

export interface ParseResult {
  entities: Entity[];
  warnings: string[];
  format: SchemaFormat;
}
