import type { Entity } from "../model";

export type SchemaFormat =
  | "prisma"
  | "sql"
  | "json-schema"
  | "openapi"
  /** Sample rows (CSV, JSON array): shape and statistics are learned. */
  | "sample";

export interface ParseResult {
  entities: Entity[];
  warnings: string[];
  format: SchemaFormat;
  /** Sample imports: how many rows were read (and then dropped). */
  sampleRows?: number;
  /** Sample imports: columns recognised as personal by their values. */
  detectedByValue?: string[];
}
