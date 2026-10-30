import {
  primaryKeyOf,
  type DataModel,
  type Dataset,
  type Entity,
  type Field,
  type Row,
} from "./model";
import { datasetSummary } from "./generate";

/**
 * Output formats. Each exporter is a pure function from (model, dataset)
 * to files, so the same run can be written into the workspace, downloaded
 * in the browser, or asserted in a test.
 */

export const EXPORT_FORMATS = [
  "json",
  "csv",
  "sql_postgres",
  "sql_mysql",
  "sql_sqlite",
  "sql_sqlserver",
  "sql_oracle",
  "prisma_seed",
  "pytest_fixtures",
] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportedFile {
  /** Path relative to the run directory. */
  path: string;
  content: string;
  mimeType: string;
}

export const FORMAT_LABELS: Record<ExportFormat, string> = {
  json: "JSON",
  csv: "CSV",
  sql_postgres: "SQL (PostgreSQL)",
  sql_mysql: "SQL (MySQL)",
  sql_sqlite: "SQL (SQLite)",
  sql_sqlserver: "SQL (SQL Server)",
  sql_oracle: "SQL (Oracle)",
  prisma_seed: "Prisma seed",
  pytest_fixtures: "pytest fixtures",
};

function tableName(entity: Entity): string {
  return entity.table ?? entity.id;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(entity: Entity, rows: Row[]): string {
  const columns = entity.fields.map((f) => f.name);
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

type Dialect = "postgres" | "mysql" | "sqlite" | "sqlserver" | "oracle";

function quoteIdent(name: string, dialect: Dialect): string {
  if (dialect === "mysql") return `\`${name.replace(/`/g, "``")}\``;
  if (dialect === "sqlserver") return `[${name.replace(/]/g, "]]")}]`;
  // Oracle folds unquoted names to upper case, which is how tables created
  // without quotes are stored; quoting a lower-case name would miss them.
  if (dialect === "oracle") {
    return /^[A-Za-z][A-Za-z0-9_$#]{0,127}$/.test(name)
      ? name
      : `"${name.replace(/"/g, '""')}"`;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

const ISO_DATETIME = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d(?:\.\d+)?)Z?$/;

function sqlLiteral(value: unknown, field: Field, dialect: Dialect): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") {
    if (dialect === "postgres" || dialect === "mysql") {
      return value ? "TRUE" : "FALSE";
    }
    return value ? "1" : "0";
  }
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "NULL";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  // SQLite has no datetime type; the convention every ORM reads back
  // (Django, SQLAlchemy, Prisma, Rails) is "YYYY-MM-DD HH:MM:SS.ffffff",
  // not ISO 8601 with "T" and "Z".
  if (
    dialect === "sqlite" &&
    field.type === "datetime" &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(text)
  ) {
    text = text
      .replace("T", " ")
      .replace("Z", "")
      .replace(/\.(\d{3})$/, ".$1000");
  }
  const escaped = text.replace(/'/g, "''");
  if (dialect === "oracle") {
    const dt = field.type === "datetime" ? text.match(ISO_DATETIME) : null;
    if (dt) return `TIMESTAMP '${dt[1]} ${dt[2]}'`;
    if (field.type === "date" && /^\d{4}-\d\d-\d\d$/.test(text)) {
      return `DATE '${text}'`;
    }
    return `'${escaped}'`;
  }
  if (dialect === "sqlserver") {
    // datetime2 accepts ISO 8601 without the zone designator.
    const dt = field.type === "datetime" ? text.match(ISO_DATETIME) : null;
    if (dt) return `'${dt[1]}T${dt[2]}'`;
    return `N'${escaped}'`;
  }
  if (dialect === "mysql") {
    return `'${escaped.replace(/\\/g, "\\\\")}'`;
  }
  if (
    dialect === "postgres" &&
    (field.type === "json" || typeof value === "object")
  ) {
    return `'${escaped}'::jsonb`;
  }
  if (
    dialect === "postgres" &&
    field.type === "array" &&
    Array.isArray(value)
  ) {
    return `ARRAY[${value.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(", ")}]`;
  }
  return `'${escaped}'`;
}

const INSERT_BATCH = 500;

function columnType(field: Field, dialect: Dialect): string {
  const n = field.maxLength && field.maxLength > 0 ? field.maxLength : 255;
  const scale = field.scale ?? 2;
  const longestEnum = Math.max(
    16,
    ...(field.enumValues ?? []).map((v) => v.length),
  );
  const pick = (map: Record<Dialect, string>) => map[dialect];
  switch (field.type) {
    case "uuid":
      return pick({
        postgres: "UUID",
        mysql: "CHAR(36)",
        sqlite: "TEXT",
        sqlserver: "UNIQUEIDENTIFIER",
        oracle: "VARCHAR2(36)",
      });
    case "text":
      return pick({
        postgres: "TEXT",
        mysql: "TEXT",
        sqlite: "TEXT",
        sqlserver: "NVARCHAR(MAX)",
        oracle: "CLOB",
      });
    case "integer":
      return pick({
        postgres: "BIGINT",
        mysql: "BIGINT",
        sqlite: "INTEGER",
        sqlserver: "BIGINT",
        oracle: "NUMBER(19)",
      });
    case "float":
      return pick({
        postgres: "DOUBLE PRECISION",
        mysql: "DOUBLE",
        sqlite: "REAL",
        sqlserver: "FLOAT",
        oracle: "BINARY_DOUBLE",
      });
    case "decimal":
      return pick({
        postgres: `NUMERIC(18, ${scale})`,
        mysql: `DECIMAL(18, ${scale})`,
        sqlite: "NUMERIC",
        sqlserver: `DECIMAL(18, ${scale})`,
        oracle: `NUMBER(18, ${scale})`,
      });
    case "boolean":
      return pick({
        postgres: "BOOLEAN",
        mysql: "BOOLEAN",
        sqlite: "INTEGER",
        sqlserver: "BIT",
        oracle: "NUMBER(1)",
      });
    case "date":
      return pick({
        postgres: "DATE",
        mysql: "DATE",
        sqlite: "TEXT",
        sqlserver: "DATE",
        oracle: "DATE",
      });
    case "datetime":
      return pick({
        postgres: "TIMESTAMP",
        mysql: "DATETIME(6)",
        sqlite: "TEXT",
        sqlserver: "DATETIME2",
        oracle: "TIMESTAMP",
      });
    case "time":
      return pick({
        postgres: "TIME",
        mysql: "TIME",
        sqlite: "TEXT",
        sqlserver: "TIME",
        oracle: "VARCHAR2(16)",
      });
    case "json":
      return pick({
        postgres: "JSONB",
        mysql: "JSON",
        sqlite: "TEXT",
        sqlserver: "NVARCHAR(MAX)",
        oracle: "CLOB",
      });
    case "bytes":
      return pick({
        postgres: "BYTEA",
        mysql: "BLOB",
        sqlite: "BLOB",
        sqlserver: "VARBINARY(MAX)",
        oracle: "BLOB",
      });
    case "array":
      return pick({
        postgres: "TEXT[]",
        mysql: "JSON",
        sqlite: "TEXT",
        sqlserver: "NVARCHAR(MAX)",
        oracle: "CLOB",
      });
    case "enum":
      return pick({
        postgres: `VARCHAR(${longestEnum})`,
        mysql: `VARCHAR(${longestEnum})`,
        sqlite: "TEXT",
        sqlserver: `NVARCHAR(${longestEnum})`,
        oracle: `VARCHAR2(${longestEnum})`,
      });
    default:
      return pick({
        postgres: `VARCHAR(${n})`,
        mysql: `VARCHAR(${n})`,
        sqlite: "TEXT",
        sqlserver: `NVARCHAR(${n})`,
        oracle: `VARCHAR2(${Math.min(n, 4000)})`,
      });
  }
}

/**
 * CREATE TABLE statements for the model, in foreign-key order, so a
 * dataset can be loaded where no application has created the tables yet
 * (a document project, a fresh test database). Keys, NOT NULL, UNIQUE,
 * allowed values and numeric ranges become constraints; foreign keys are
 * added after every table exists (SQLite declares them inline).
 */
export function toSqlSchema(
  model: DataModel,
  order: string[],
  dialect: Dialect,
): string {
  const q = (name: string) => quoteIdent(name, dialect);
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  const ordered = [
    ...order.map((id) => byId.get(id)).filter((e): e is Entity => Boolean(e)),
    ...model.entities.filter((e) => !order.includes(e.id)),
  ];
  const lines: string[] = [
    "-- Tables for the Neo Synth data model (load before the seed file).",
    "",
  ];
  const foreignKeys: string[] = [];
  for (const entity of ordered) {
    const defs: string[] = [];
    const pk = entity.fields.filter((f) => f.primaryKey);
    for (const field of entity.fields) {
      const parts = [q(field.name), columnType(field, dialect)];
      if (!field.nullable || field.primaryKey) parts.push("NOT NULL");
      if (field.unique && !field.primaryKey) parts.push("UNIQUE");
      // Lossy privacy treatments change values; their checks would fail.
      const checked = !field.treatment || field.treatment === "synthesize";
      if (checked && field.type === "enum" && field.enumValues?.length) {
        parts.push(
          `CHECK (${q(field.name)} IN (${field.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")}))`,
        );
      }
      const numeric =
        field.type === "integer" ||
        field.type === "decimal" ||
        field.type === "float";
      if (
        checked &&
        numeric &&
        (field.min !== undefined || field.max !== undefined)
      ) {
        const bounds = [
          field.min !== undefined ? `${q(field.name)} >= ${field.min}` : null,
          field.max !== undefined ? `${q(field.name)} <= ${field.max}` : null,
        ].filter(Boolean);
        parts.push(`CHECK (${bounds.join(" AND ")})`);
      }
      if (field.references && dialect === "sqlite") {
        const parent = byId.get(field.references.entity);
        if (parent)
          parts.push(
            `REFERENCES ${q(tableName(parent))} (${q(field.references.field)})`,
          );
      }
      defs.push(`  ${parts.join(" ")}`);
      if (field.references && dialect !== "sqlite") {
        const parent = byId.get(field.references.entity);
        if (parent) {
          foreignKeys.push(
            `ALTER TABLE ${q(tableName(entity))} ADD FOREIGN KEY (${q(field.name)}) REFERENCES ${q(tableName(parent))} (${q(field.references.field)});`,
          );
        }
      }
    }
    if (pk.length)
      defs.push(`  PRIMARY KEY (${pk.map((f) => q(f.name)).join(", ")})`);
    for (const group of entity.uniqueTogether ?? []) {
      defs.push(`  UNIQUE (${group.map((f) => q(f)).join(", ")})`);
    }
    const ifNotExists =
      dialect === "postgres" || dialect === "mysql" || dialect === "sqlite"
        ? "IF NOT EXISTS "
        : "";
    lines.push(
      `CREATE TABLE ${ifNotExists}${q(tableName(entity))} (`,
      defs.join(",\n"),
      ");",
      "",
    );
  }
  if (foreignKeys.length) lines.push(...foreignKeys, "");
  return lines.join("\n");
}

export function toSql(
  model: DataModel,
  dataset: Dataset,
  dialect: Dialect,
): string {
  const lines: string[] = [
    `-- Synthetic data generated by Neo Synth`,
    `-- scenario: ${dataset.scenarioId}  seed: ${dataset.seed}  model: ${dataset.modelHash}`,
    `-- generated: ${dataset.generatedAt}`,
    `-- Insert order follows foreign keys; tables in a cycle are noted in the manifest.`,
    "",
  ];
  if (dialect === "postgres") lines.push("BEGIN;", "");
  if (dialect === "mysql")
    lines.push("START TRANSACTION;", "SET FOREIGN_KEY_CHECKS = 0;", "");
  if (dialect === "sqlite")
    lines.push("PRAGMA foreign_keys = OFF;", "BEGIN TRANSACTION;", "");
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  const loaded = dataset.order
    .map((id) => byId.get(id))
    .filter((e): e is Entity =>
      Boolean(e && (dataset.tables[e.id] ?? []).length),
    );
  if (dialect === "sqlserver") {
    lines.push("SET XACT_ABORT ON;", "BEGIN TRANSACTION;");
    for (const e of loaded) {
      lines.push(
        `ALTER TABLE ${quoteIdent(tableName(e), dialect)} NOCHECK CONSTRAINT ALL;`,
      );
    }
    lines.push("");
  }
  if (dialect === "oracle") {
    lines.push(
      "-- Oracle: one INSERT per row (no multi-row VALUES before 23ai). Identity",
      "-- columns declared GENERATED ALWAYS must be GENERATED BY DEFAULT to load",
      "-- explicit ids.",
      "",
    );
  }
  for (const id of dataset.order) {
    const entity = byId.get(id);
    const rows = dataset.tables[id] ?? [];
    if (!entity || rows.length === 0) continue;
    const columns = entity.fields.map((f) => f.name);
    const table = quoteIdent(tableName(entity), dialect);
    const colList = columns.map((c) => quoteIdent(c, dialect)).join(", ");
    lines.push(`-- ${rows.length} rows into ${tableName(entity)}`);
    if (dialect === "oracle") {
      for (const row of rows) {
        lines.push(
          `INSERT INTO ${table} (${colList}) VALUES (${entity.fields.map((f) => sqlLiteral(row[f.name], f, dialect)).join(", ")});`,
        );
      }
      lines.push("");
      continue;
    }
    const pk = primaryKeyOf(entity);
    const identity =
      dialect === "sqlserver" && pk?.type === "integer" && pk.generated;
    if (identity) lines.push(`SET IDENTITY_INSERT ${table} ON;`);
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH) {
      const batch = rows.slice(offset, offset + INSERT_BATCH);
      const values = batch
        .map(
          (row) =>
            `  (${entity.fields.map((f) => sqlLiteral(row[f.name], f, dialect)).join(", ")})`,
        )
        .join(",\n");
      lines.push(`INSERT INTO ${table} (${colList}) VALUES\n${values};`);
    }
    if (identity) lines.push(`SET IDENTITY_INSERT ${table} OFF;`);
    lines.push("");
  }
  if (dialect === "postgres") {
    // Reset sequences so the app can insert after the seed.
    for (const id of dataset.order) {
      const entity = byId.get(id);
      if (!entity) continue;
      const pk = primaryKeyOf(entity);
      if (pk?.type !== "integer" || !(dataset.tables[id] ?? []).length) {
        continue;
      }
      lines.push(
        `SELECT setval(pg_get_serial_sequence('${tableName(entity).replace(/'/g, "''")}', '${pk.name}'), COALESCE((SELECT MAX(${quoteIdent(pk.name, dialect)}) FROM ${quoteIdent(tableName(entity), dialect)}), 1));`,
      );
    }
    lines.push("", "COMMIT;");
  }
  if (dialect === "mysql") lines.push("SET FOREIGN_KEY_CHECKS = 1;", "COMMIT;");
  if (dialect === "sqlite") lines.push("COMMIT;", "PRAGMA foreign_keys = ON;");
  if (dialect === "sqlserver") {
    for (const e of loaded) {
      lines.push(
        `ALTER TABLE ${quoteIdent(tableName(e), dialect)} WITH CHECK CHECK CONSTRAINT ALL;`,
      );
    }
    lines.push("COMMIT TRANSACTION;");
  }
  if (dialect === "oracle") lines.push("COMMIT;");
  return `${lines.join("\n")}\n`;
}

function camel(name: string): string {
  return name.replace(/[_-]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function toPrismaSeed(model: DataModel, dataset: Dataset): string {
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  const lines: string[] = [
    "// Synthetic data generated by Neo Synth.",
    `// scenario: ${dataset.scenarioId}  seed: ${dataset.seed}  model: ${dataset.modelHash}`,
    '// Run with: npx tsx prisma/seed.ts   (or wire it into package.json "prisma": {"seed": ...})',
    'import { PrismaClient } from "@prisma/client";',
    'import { readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    "",
    "const prisma = new PrismaClient();",
    "",
    "function load(name: string): Record<string, unknown>[] {",
    '  return JSON.parse(readFileSync(join(__dirname, "data", `${name}.json`), "utf8"));',
    "}",
    "",
    "async function main() {",
  ];
  for (const id of dataset.order) {
    const entity = byId.get(id);
    if (!entity || !(dataset.tables[id] ?? []).length) continue;
    const delegate = camel(
      entity.name.charAt(0).toLowerCase() + entity.name.slice(1),
    );
    lines.push(
      `  await prisma.${delegate}.createMany({ data: load(${JSON.stringify(id)}) as never[], skipDuplicates: true });`,
      `  console.log("seeded ${id}");`,
    );
  }
  lines.push(
    "}",
    "",
    "main()",
    "  .catch((error) => {",
    "    console.error(error);",
    "    process.exit(1);",
    "  })",
    "  .finally(() => prisma.$disconnect());",
    "",
  );
  return lines.join("\n");
}

export function toPytestConftest(dataset: Dataset): string {
  const lines = [
    '"""Synthetic data fixtures generated by Neo Synth."""',
    `# scenario: ${dataset.scenarioId}  seed: ${dataset.seed}  model: ${dataset.modelHash}`,
    "import json",
    "from pathlib import Path",
    "",
    "import pytest",
    "",
    'DATA_DIR = Path(__file__).parent / "data"',
    "",
    "",
    "def _load(name: str):",
    '    with open(DATA_DIR / f"{name}.json", encoding="utf-8") as handle:',
    "        return json.load(handle)",
    "",
  ];
  for (const id of dataset.order) {
    lines.push(
      "",
      '@pytest.fixture(scope="session")',
      `def synth_${id}():`,
      `    return _load(${JSON.stringify(id)})`,
      "",
    );
  }
  lines.push(
    "",
    '@pytest.fixture(scope="session")',
    "def synth_dataset():",
    "    return {",
    ...dataset.order.map(
      (id) => `        ${JSON.stringify(id)}: _load(${JSON.stringify(id)}),`,
    ),
    "    }",
    "",
  );
  return lines.join("\n");
}

export interface Manifest {
  generator: "neo-synth";
  version: 1;
  scenario: string;
  seed: number;
  modelHash: string;
  generatedAt: string;
  insertOrder: string[];
  tables: Record<string, { rows: number; file: string; edgeRows: number }>;
  warnings: string[];
}

export function buildManifest(dataset: Dataset): Manifest {
  const { perEntity } = datasetSummary(dataset);
  const tables: Manifest["tables"] = {};
  for (const id of dataset.order) {
    tables[id] = {
      rows: perEntity[id] ?? 0,
      file: `data/${id}.json`,
      edgeRows: dataset.edgeRows[id]?.length ?? 0,
    };
  }
  return {
    generator: "neo-synth",
    version: 1,
    scenario: dataset.scenarioId,
    seed: dataset.seed,
    modelHash: dataset.modelHash,
    generatedAt: dataset.generatedAt,
    insertOrder: dataset.order,
    tables,
    warnings: dataset.warnings,
  };
}

/** Files for the requested formats; `data/*.json` and the manifest always ship. */
export function exportDataset(
  model: DataModel,
  dataset: Dataset,
  formats: readonly ExportFormat[],
): ExportedFile[] {
  const files: ExportedFile[] = [];
  const byId = new Map(model.entities.map((e) => [e.id, e]));
  files.push({
    path: "manifest.json",
    content: `${JSON.stringify(buildManifest(dataset), null, 2)}\n`,
    mimeType: "application/json",
  });
  const wants = new Set(formats);
  if (
    wants.has("json") ||
    wants.has("prisma_seed") ||
    wants.has("pytest_fixtures") ||
    formats.length === 0
  ) {
    for (const id of dataset.order) {
      files.push({
        path: `data/${id}.json`,
        content: `${JSON.stringify(dataset.tables[id] ?? [], null, 2)}\n`,
        mimeType: "application/json",
      });
    }
  }
  if (wants.has("csv")) {
    for (const id of dataset.order) {
      const entity = byId.get(id);
      if (!entity) continue;
      files.push({
        path: `csv/${id}.csv`,
        content: toCsv(entity, dataset.tables[id] ?? []),
        mimeType: "text/csv",
      });
    }
  }
  if (wants.has("sql_postgres")) {
    files.push({
      path: "schema.postgres.sql",
      content: toSqlSchema(model, dataset.order, "postgres"),
      mimeType: "application/sql",
    });
    files.push({
      path: "seed.postgres.sql",
      content: toSql(model, dataset, "postgres"),
      mimeType: "application/sql",
    });
  }
  if (wants.has("sql_mysql")) {
    files.push({
      path: "schema.mysql.sql",
      content: toSqlSchema(model, dataset.order, "mysql"),
      mimeType: "application/sql",
    });
    files.push({
      path: "seed.mysql.sql",
      content: toSql(model, dataset, "mysql"),
      mimeType: "application/sql",
    });
  }
  if (wants.has("sql_sqlserver")) {
    files.push({
      path: "schema.sqlserver.sql",
      content: toSqlSchema(model, dataset.order, "sqlserver"),
      mimeType: "application/sql",
    });
    files.push({
      path: "seed.sqlserver.sql",
      content: toSql(model, dataset, "sqlserver"),
      mimeType: "application/sql",
    });
  }
  if (wants.has("sql_oracle")) {
    files.push({
      path: "schema.oracle.sql",
      content: toSqlSchema(model, dataset.order, "oracle"),
      mimeType: "application/sql",
    });
    files.push({
      path: "seed.oracle.sql",
      content: toSql(model, dataset, "oracle"),
      mimeType: "application/sql",
    });
  }
  if (wants.has("sql_sqlite")) {
    files.push({
      path: "schema.sqlite.sql",
      content: toSqlSchema(model, dataset.order, "sqlite"),
      mimeType: "application/sql",
    });
    files.push({
      path: "seed.sqlite.sql",
      content: toSql(model, dataset, "sqlite"),
      mimeType: "application/sql",
    });
  }
  if (wants.has("prisma_seed")) {
    files.push({
      path: "prisma/seed.ts",
      content: toPrismaSeed(model, dataset),
      mimeType: "text/typescript",
    });
  }
  if (wants.has("pytest_fixtures")) {
    files.push({
      path: "conftest_synth.py",
      content: toPytestConftest(dataset),
      mimeType: "text/x-python",
    });
  }
  return files;
}

export function totalBytes(files: ExportedFile[]): number {
  return files.reduce((sum, f) => sum + f.content.length, 0);
}
